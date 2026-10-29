#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
split-block.py —— server.js 渐进拆分搬运工具

把 server.js 里 [start,end] 行区间原样搬进 api/ 或 lib/ 下的模块，
并在原位置留 require 存根。默认「逐字节搬运」，只在显式要求时做两种改写：

  --root-const   块内 __dirname 全部替换为 ROOT（模块内定义 ROOT = path.join(__dirname,'..')）
                 用于块里拼 uploads/tmp 等相对 server/ 根的路径，否则拆进 api/ 后路径错位。
  --export NAME  把这些块内顶层符号记到 docstring 里（不导出，仅备忘）

用法：
  python3 scripts/split-block.py --start 9194 --end 9425 \
      --module api/project-nodes.js --fn registerProjectNodeRoutes \
      --deps "db, app, getUserId, addLog" \
      --title "进度节点模板 / 模板节点 / 项目节点" \
      --round 14

设计原则（都是踩过的坑）：
  1. 只搬不改 —— 除了 --root-const，任何一行都不许动，否则无法证明行为不变。
  2. 搬运后立即做「去缩进逐字节比对」，不一致直接退出 1，不落盘。
  3. 先验证再写文件 —— 比对在写入前完成，避免留下半成品（v2.5.2 事故）。
"""
import argparse
import os
import re
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--start', type=int, required=True)
    ap.add_argument('--end', type=int, required=True)
    ap.add_argument('--module', required=True, help='相对 server/ 的模块路径，如 api/xxx.js')
    ap.add_argument('--fn', required=True, help='导出的注册函数名，如 registerXxxRoutes')
    ap.add_argument('--deps', default='', help='deps 解构清单，逗号分隔')
    ap.add_argument('--title', default='', help='模块中文标题，写进 docstring')
    ap.add_argument('--round', default='', help='第几轮拆分')
    ap.add_argument('--root-const', action='store_true', help='块内 __dirname 换成 ROOT')
    ap.add_argument('--file', default=None, help='server.js 路径，默认 ../server/server.js')
    ap.add_argument('--dry-run', action='store_true', help='只分析不写文件')
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    server_js = args.file or os.path.join(here, '..', 'server', 'server.js')
    server_js = os.path.abspath(server_js)
    module_path = os.path.join(os.path.dirname(server_js), args.module)
    module_path = os.path.abspath(module_path)

    text = open(server_js, encoding='utf-8').read()
    lines = text.split('\n')
    start, end = args.start, args.end

    if not (1 <= start <= end <= len(lines)):
        sys.exit(f'行区间非法：{start}-{end}（文件 {len(lines)} 行）')
    if os.path.exists(module_path):
        sys.exit(f'目标模块已存在，拒绝覆盖：{module_path}')

    block = lines[start - 1:end]

    # 安全检查：块内不许有 require / module.exports，否则搬进包装函数语义会变
    bad = [i + start for i, ln in enumerate(block)
           if re.match(r'^\s*(module\.exports|exports\.)', ln)]
    if bad:
        sys.exit(f'块内出现 module.exports/exports（第 {bad} 行），本工具不支持，请人工处理')
    # 第三方包的 require('pdf-lib') 位置无关，可以原样搬；
    # 但相对路径 require('./x') 会因模块目录变化而失效，必须人工处理。
    rel_reqs = [i + start for i, ln in enumerate(block)
                if re.search(r'''require\s*\(\s*['"]\.\.?/''', ln)]
    if rel_reqs:
        sys.exit(f'块内出现相对路径 require（第 {rel_reqs} 行），搬进 api/ 后路径会变，请人工处理')

    if args.root_const:
        block = [ln.replace('__dirname', 'ROOT') for ln in block]

    deps = [d.strip() for d in args.deps.split(',') if d.strip()]
    round_txt = f'第 {args.round} 轮' if args.round else ''
    title = args.title or args.module

    header = f'''/**
 * {title}（2026-10-29 渐进拆分{round_txt}）
 *
 * 搬运自 server.js 原 {start}-{end} 行，共 {end - start + 1} 行。
 * 除下方说明的改写外，逐字节原样搬入，未做任何逻辑调整。
'''
    if args.root_const:
        header += ''' *
 * ⚠️ 唯一改写：块内 `__dirname` 已全部替换为 `ROOT`。
 *    原文件中 __dirname 指 server/ 根（uploads、tmp 等路径），
 *    搬进 api/ 后会变成 server/api，路径全部错位，所以模块内补
 *    `const ROOT = path.join(__dirname, '..')` 还原成原语义。
'''
    header += ''' */
module.exports = function ''' + args.fn + '''(app, deps) {
  const {
    ''' + ',\n    '.join(deps) + ''',
  } = deps;
'''
    if args.root_const:
        header += '''
  // 还原原 server.js 的 __dirname（server/ 根）
  const ROOT = path.join(__dirname, '..');
'''
    header += '\n'

    # 缩进策略：JS 代码行统一 +2，但**模板字符串内部的内容行一律不动**。
    # 血泪教训（第 17 轮）：api/main-materials.js 里有内嵌 Python 脚本：
    #     const script = `
    #     import json,sys,openpyxl
    #     ...
    #     `;
    # 这几行是「字符串数据」不是代码，整体缩进会让 Python 首行变成
    # `  import json...` → IndentationError: unexpected indent，导出接口直接 500。
    # SQL 对前导空格不敏感看不出来，但 Python / heredoc / YAML 会立刻炸。
    def indent_block(src):
        out = []
        in_tpl = False
        for ln in src:
            starts_in_tpl = in_tpl
            ticks = len(re.findall(r'(?<!\\)`', ln))
            if ticks % 2 == 1:
                in_tpl = not in_tpl
            if not ln.strip():
                out.append(ln)
            elif starts_in_tpl or ln.lstrip().startswith('`'):
                # 模板内容行（含结束反引号那行）：保持原样，绝不加缩进
                out.append(ln)
            else:
                out.append('  ' + ln)
        return out

    body = indent_block(block)
    module_text = header + '\n'.join(body) + '\n};\n'

    # ---- 写盘前先验证 ----
    # 期望值直接由「原块 + 同一个缩进函数」算出来，再和实际落盘内容比。
    # 注意不能简单「去掉 2 个空格」反向还原：模板内容行本来就没加缩进，
    # 反向还原会把它们弄错，产生假报警。
    expected = indent_block(block)
    moved = module_text.split('\n')

    # 定位正文起点：第一个与 expected[0] 内容相同的行（跳过同名的文档注释行）
    idx = None
    for i, ln in enumerate(moved):
        if ln == expected[0]:
            idx = i
            break
    if idx is None:
        # 兜底：按 strip 后内容匹配
        anchor = expected[0].strip()
        for i, ln in enumerate(moved):
            if anchor and ln.strip() == anchor:
                idx = i
                break
    if idx is None:
        sys.exit('内部错误：无法定位正文起点')
    body_moved = moved[idx:idx + len(expected)]
    if body_moved != expected:
        for k, (a, b) in enumerate(zip(expected, body_moved)):
            if a != b:
                sys.exit(f'逐字节比对失败 @ 原 {start + k} 行\n  old: {a!r}\n  new: {b!r}')
        sys.exit(f'行数不一致：原 {len(expected)} / 新 {len(body_moved)}')

    if args.dry_run:
        print(f'[dry-run] 比对通过，{len(block)} 行；未写文件')
        return

    # ---- 落盘 ----
    os.makedirs(os.path.dirname(module_path), exist_ok=True)
    with open(module_path, 'w', encoding='utf-8') as f:
        f.write(module_text)

    rel = os.path.relpath(module_path, os.path.dirname(server_js)).replace(os.sep, '/')
    stub = [
        f'// ==================== {title} ====================',
        f'// {end - start + 1} 行已抽到 ./{rel}（2026-10-29 渐进拆分{round_txt}，注册顺序不变）',
        f"require('./{rel[:-3]}')(app, {{",
    ]
    # deps 每行放 4 个，避免超长
    chunk = []
    for i, d in enumerate(deps):
        chunk.append(d)
        if len(chunk) == 5 or i == len(deps) - 1:
            stub.append('  ' + ', '.join(chunk) + ',')
            chunk = []
    stub.append('});')

    lines[start - 1:end] = stub
    with open(server_js, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'✅ {args.module}  {len(block)} 行  逐字节一致')
    print(f'   server.js {len(lines)} 行（原 {len(lines) + len(block) - len(stub)} 行）')


if __name__ == '__main__':
    main()
