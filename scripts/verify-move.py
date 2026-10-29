#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
搬迁校验器：证明「代码是从 server.js 原样搬到模块里」而不是顺手改了什么。

为什么需要它
------------------------------------------------------------
渐进拆分最大的风险不是文件变多，而是搬的过程中「顺手改了一行」——
一个 `if` 少了取反、一个 `await` 漏了，冒烟测试未必抓得到（比如只在
特定参数下才出错的写接口）。所以每次搬迁后必须做逐行比对。

怎么比
------------------------------------------------------------
用**内容锚点**定位，不用行号。行号一定会错——工作副本每搬一次就少几百行，
git HEAD 里的 13741 行和工作副本的 13741 行根本不是同一处。这个坑已经踩过。

从 `git show HEAD:server/server.js` 里切出原始块，从模块文件里切出
`= deps;` 之后到最后一个 `};` 之前的 body，按行比对（忽略统一加的缩进）。

用法
------------------------------------------------------------
  python3 scripts/verify-move.py server/api/todo.js \\
      --start "function __todoScope" \\
      --end   "app.get('*'"

  # 锚点就是「原始块的首行」和「原始块之后的第一行」（都是全文精确匹配）
  # --file 可选，默认 server/server.js

退出码 0 = 逐行一致；1 = 有差异或锚点没找到。
"""
import argparse
import difflib
import io
import subprocess
import sys


def load_head(path):
    r = subprocess.run(['git', 'show', f'HEAD:{path}'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'✗ 读不到 HEAD:{path}\n{r.stderr.strip()}')
    return r.stdout.split('\n')


def load_file(path):
    try:
        return io.open(path, encoding='utf-8').read().split('\n')
    except OSError as e:
        sys.exit(f'✗ 读不到基准文件 {path}\n{e}')


def find_exact(lines, text, what):
    hits = [i for i, l in enumerate(lines) if l == text]
    if not hits:
        # 退一步：允许前缀匹配，方便只写半行
        hits = [i for i, l in enumerate(lines) if l.startswith(text)]
    if not hits:
        sys.exit(f'✗ 找不到{what}：{text!r}')
    if len(hits) > 1:
        sys.exit(f'✗ {what}不唯一（{len(hits)} 处，行 {[h+1 for h in hits]}）：{text!r}\n'
                 f'   请把锚点写长一点，精确到只有一处。')
    return hits[0]


def extract_body(module_lines):
    """切出 factory 里 injected deps 之后、最外层 `};` 之前的正文。"""
    start = next((i for i, l in enumerate(module_lines) if '} = deps;' in l), None)
    if start is None:
        # 支持单行解构：const { a, b } = deps;
        start = next((i for i, l in enumerate(module_lines)
                      if '= deps;' in l), None)
    if start is None:
        sys.exit('✗ 模块里找不到 `= deps;` —— 它不是 package 注入式模块？')
    end = next((i for i in range(len(module_lines) - 1, 0, -1)
                if module_lines[i] == '};'), None)
    if end is None:
        sys.exit('✗ 模块里找不到闭合的 `};`')
    if end <= start:
        sys.exit('✗ `};` 在 `= deps;` 之前，结构不对')

    raw = module_lines[start + 1:end]
    # 只给「有内容的行」去掉统一加的 2 空格缩进；纯空白行原样保留
    return [(l[2:] if (l.startswith('  ') and l.strip()) else l) for l in raw]


def trim(a):
    while a and not a[0].strip():
        a = a[1:]
    while a and not a[-1].strip():
        a = a[:-1]
    return a


def main():
    ap = argparse.ArgumentParser(description='证明搬迁零改动')
    ap.add_argument('module', help='搬迁后的模块文件，如 server/api/todo.js')
    ap.add_argument('--start', required=True, help='原始块首行的全文')
    ap.add_argument('--end', required=True, help='原始块之后第一行的全文')
    ap.add_argument('--file', default='server/server.js', help='原始文件（默认 server/server.js）')
    ap.add_argument('--from', dest='baseline', default=None,
                    help='基准来源：省略=git HEAD:<file>；也可给一份工作副本快照路径'
                         '（拆分未提交时用 /tmp/server.js.before-splitN）')
    args = ap.parse_args()

    if args.baseline:
        head = load_file(args.baseline)
        src_label = args.baseline
    else:
        head = load_head(args.file)
        src_label = f'HEAD:{args.file}'
    s = find_exact(head, args.start, '起始锚点')
    e = find_exact(head, args.end, '结束锚点')
    if e <= s:
        sys.exit(f'✗ 结束锚点在起始锚点之前（{s+1} vs {e+1}），检查参数顺序')

    orig = head[s:e]
    module = io.open(args.module, encoding='utf-8').read().split('\n')
    moved = extract_body(module)

    a, b = trim(orig), trim(moved)
    print(f'  原始块  {src_label} 第 {s+1}..{e} 行   {len(a)} 行')
    print(f'  搬迁后  {args.module}                {len(b)} 行')

    if a == b:
        print('  ✓ 逐行完全一致，零改动')
        return 0

    # 区分「实质差异」和「纯行尾空白差异」
    if [x.rstrip() for x in a] == [x.rstrip() for x in b]:
        print('  ✓ 实质内容完全一致（仅空行行尾空格数不同，无语义影响）')
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                print(f'     第 {i+1} 行: HEAD={x!r}  搬迁={y!r}')
        return 0

    diff = list(difflib.unified_diff(a, b, 'HEAD', args.module, lineterm='', n=2))
    print(f'  ✗ 实质差异 {len(diff)} 行：')
    for line in diff[:60]:
        print('     ', line)
    if len(diff) > 60:
        print(f'      ...（还有 {len(diff)-60} 行）')
    return 1


if __name__ == '__main__':
    sys.exit(main())
