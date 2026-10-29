#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-stub-order.py —— 拆分存根的 TDZ 检查

背景（2026-10-29 第 16 轮踩到的坑）：
把一段路由搬进 api/xxx.js 后，server.js 原位留下
    require('./api/xxx')(app, { db, pool, getUserId, isAdmin, ... });
这个对象字面量是**立即求值**的。而 server.js 里 `getUserId` / `isAdmin`
是 `const`（不是函数声明，不会提升），如果存根出现在它们的定义**之前**，
启动时会直接抛
    ReferenceError: Cannot access 'getUserId' before initialization
整个进程起不来（Apache 反代表现为 503）。

函数声明（`function foo(){}` / `async function foo(){}`）会提升，不受影响，
所以只有 const/let/var 定义的依赖才需要处理。

修法：把存根里这些依赖包一层箭头，延迟到请求时才求值：
    getUserId: (...a) => getUserId(...a),
这样注册顺序保持原样（不能为了避开 TDZ 把存根挪到后面，那会改变路由匹配顺序）。

用法：
    python3 scripts/check-stub-order.py            # 检查 server/server.js
    python3 scripts/check-stub-order.py --file xxx # 指定文件

退出码：0 无问题；1 存在 TDZ 风险。
"""
import argparse
import os
import re
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', default=None)
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    path = args.file or os.path.join(here, '..', 'server', 'server.js')
    lines = open(os.path.abspath(path), encoding='utf-8').read().split('\n')

    # 收集顶层定义：名字 -> (行号, 是否函数声明)
    defs = {}
    for i, ln in enumerate(lines, 1):
        if not ln or ln[0].isspace():
            continue
        m = re.match(r'^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=', ln)
        if m:
            defs.setdefault(m.group(1), (i, False))
            continue
        m = re.match(r'^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', ln)
        if m:
            defs.setdefault(m.group(1), (i, True))
            continue
        m = re.match(r'^const\s*\{([^}]*)\}\s*=', ln)
        if m:
            for raw in m.group(1).split(','):
                name = raw.split(':')[-1].strip()
                if re.fullmatch(r'[A-Za-z_$][\w$]*', name or ''):
                    defs.setdefault(name, (i, False))

    problems = []
    i = 0
    while i < len(lines):
        m = re.match(r"^require\('\./(api|lib)/([\w-]+)'\)\(app,\s*\{", lines[i])
        if not m:
            i += 1
            continue
        stub_line = i + 1
        j = i
        while j < len(lines) - 1 and '});' not in lines[j]:
            j += 1
        buf = '\n'.join(lines[i:j + 1])
        inner = buf.split('{', 1)[1] if '{' in buf else ''
        for tok in inner.replace('\n', ' ').split(','):
            tok = tok.strip()
            name = tok.split(':')[0].strip()
            if not re.fullmatch(r'[A-Za-z_$][\w$]*', name or ''):
                continue
            # 已经包了箭头的（延迟求值）跳过
            if '=>' in tok:
                continue
            d = defs.get(name)
            if d and d[0] > stub_line and not d[1]:
                problems.append((stub_line, f'{m.group(1)}/{m.group(2)}', name, d[0]))
        i = j + 1

    if not problems:
        print('✅ 所有存根的 const 依赖都在注册点之前定义（无 TDZ 风险）')
        return 0

    print(f'❌ 发现 {len(problems)} 处 TDZ 风险（const 定义晚于存根 → 启动会崩）：')
    for stub, mod, name, dline in problems:
        print(f'   存根第 {stub} 行  {mod:<24} 依赖 {name:<28} 定义于第 {dline} 行')
    print('\n修法：存根里改成 `%s: (...a) => %s(...a),`（延迟求值，注册顺序不变）' % ('name', 'name'))
    return 1


if __name__ == '__main__':
    sys.exit(main())
