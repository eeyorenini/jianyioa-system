#!/usr/bin/env bash
# =============================================================================
# 建亿OA 升级包生成脚本
# =============================================================================
#
# 用法:
#   ./scripts/make-release.sh v2.5.3                # 出包（含 zip）
#   ./scripts/make-release.sh v2.5.3 --no-zip       # 只出目录
#   ./scripts/make-release.sh v2.5.3 --force        # 目标已存在时先挪走再出
#   ./scripts/make-release.sh v2.5.3 --skip-version # 跳过版本号一致性检查
#   ./scripts/make-release.sh v2.5.3 --zip-only     # 只重打 zip（填完修改记录后用）
#
# 产物:
#   ~/Desktop/jianyioa项目版本管理/版本升级/v{版本}/
#     server/            ← 后端（排除式复制，新增 .js 默认进包）
#       material-pinyin.js  ← v2.5.2 事故根源：以前白名单硬编码漏了这个
#     web/dist/          ← PC 端
#     h5/                ← 与 server/public-mobile-h5 同源（兼容老结构）
#     miniprogram/       ← 小程序
#   同级 v{版本}.zip
#
# 设计原则（为什么用排除式而不是白名单）:
#   v2.5.2 的打包清单是硬编码白名单，只拷 server.js + public-mobile-h5，
#   结果新增的 server/material-pinyin.js 没进包 → Node 启动 Cannot find module
#   → 3002 无监听 → 整站 503。白名单的错法是「悄悄漏」，排除式的错法是
#   「多带垃圾」，后者无害。再加依赖完整性断言兜底，漏文件时脚本直接拒绝出包。
#
# 不做什么（有意为之）:
#   · 不 build 三端产物（构建要分开跑，容易 ECONNREFUSED，由人/agent 单独执行）
#   · 不动 git（不 commit、不打 tag，等大王明示）
#   · 不覆盖已存在的 修改记录.md
# =============================================================================

set -uo pipefail

# ---------- 路径 ----------
PROJECT_ROOT="${PROJECT_ROOT:-/Users/gtamer/Desktop/jianyioa-system}"
OUT_BASE="${OUT_BASE:-$HOME/Desktop/jianyioa项目版本管理/版本升级}"
MP_DIST="${MP_DIST:-$HOME/Desktop/jianyioa-miniprogram}"
MP_SRC_PKG="${MP_SRC_PKG:-$HOME/Desktop/jianyioa-mpweixin/mobile/package.json}"
NODE_BIN="${NODE_BIN:-$(command -v node || echo /Users/gtamer/.workbuddy/binaries/node/versions/22.22.2-6/bin/node)}"

# ---------- 颜色 ----------
if [ -t 1 ]; then
  C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_D=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_R=''; C_G=''; C_Y=''; C_D=''; C_B=''; C_0=''
fi

ok()   { printf "  %s✓%s %s\n" "$C_G" "$C_0" "$*"; }
warn() { printf "  %s⚠%s %s\n" "$C_Y" "$C_0" "$*"; }
err()  { printf "  %s✗%s %s\n" "$C_R" "$C_0" "$*"; }
dim()  { printf "  %s%s%s\n" "$C_D" "$*" "$C_0"; }
step() { printf "\n%s▸ %s%s\n" "$C_B" "$*" "$C_0"; }

# ---------- 参数 ----------
VER_RAW=""
DO_ZIP=1
DO_FORCE=0
SKIP_VERSION=0
ZIP_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-zip)         DO_ZIP=0 ;;
    --zip-only)       ZIP_ONLY=1 ;;
    --force)          DO_FORCE=1 ;;
    --skip-version)   SKIP_VERSION=1 ;;
    -h|--help)        sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)               err "未知参数: $1"; exit 2 ;;
    *)                VER_RAW="$1" ;;
  esac
  shift
done

if [ -z "$VER_RAW" ]; then
  err "请给版本号，例如: ./scripts/make-release.sh v2.5.3"
  exit 2
fi

# 归一化: v2.5.3 / 2.5.3 → 2.5.3
VER="${VER_RAW#v}"
if ! printf '%s' "$VER" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  err "版本号格式不对: ${VER_RAW}（要 2.5.3 或 v2.5.3）"
  exit 2
fi
TAG="v$VER"
DIR="$OUT_BASE/$TAG"

# ---------- 打包函数（--zip-only 复用） ----------
do_zip() {
  step "打 zip（UTF-8 中文文件名）"
  python3 - "$OUT_BASE" "$TAG" <<'PY'
import os, sys, zipfile
base, tag = sys.argv[1], sys.argv[2]
src  = os.path.join(base, tag)
dst  = os.path.join(base, tag + '.zip')
n = 0
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        for f in files:
            if f == '.DS_Store' or f.endswith('.zip'):
                continue
            full = os.path.join(root, f)
            rel  = os.path.join(tag, os.path.relpath(full, src)).replace(os.sep, '/')
            zi = zipfile.ZipInfo(rel)
            zi.flag_bits |= 0x800          # UTF-8 文件名，Windows 解压不乱码
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            with open(full, 'rb') as fh:
                z.writestr(zi, fh.read())
            n += 1
print(f'  ✓ {tag}.zip  {n} 个文件  {os.path.getsize(dst)/1048576:.2f} MB')
PY
  return $?
}

# --zip-only：目录已就绪（比如刚手填完 修改记录.md），只重打 zip
if [ "$ZIP_ONLY" -eq 1 ]; then
  if [ ! -d "$DIR" ]; then
    err "目录不存在，没法只打 zip: $DIR"
    exit 1
  fi
  printf "\n%s═══ 重打 %s.zip ═══%s\n" "$C_B" "$TAG" "$C_0"
  if ! do_zip; then err "zip 打包失败"; exit 1; fi
  printf "\n"
  exit 0
fi

printf "\n%s═══ 出包 %s ═══%s\n" "$C_B" "$TAG" "$C_0"
dim "项目: $PROJECT_ROOT"
dim "输出: $DIR"

# ---------- 前置检查 ----------
step "前置检查"

if [ ! -f "$PROJECT_ROOT/server/server.js" ]; then
  err "找不到 $PROJECT_ROOT/server/server.js"; exit 1
fi
ok "server/server.js 存在"

if [ ! -d "$PROJECT_ROOT/web/dist" ]; then
  err "找不到 web/dist，PC 端没 build"; exit 1
fi
ok "web/dist 存在"

if [ -d "$MP_DIST" ]; then
  ok "miniprogram 产物存在（${MP_DIST}）"
else
  warn "找不到小程序产物目录 ${MP_DIST}，将跳过 miniprogram/"
fi

if [ -d "$PROJECT_ROOT/server/public-mobile-h5" ]; then
  ok "server/public-mobile-h5 存在（H5）"
else
  err "找不到 server/public-mobile-h5，H5 端没 build"; exit 1
fi

# 目标目录处理
if [ -e "$DIR" ]; then
  if [ "$DO_FORCE" -eq 1 ]; then
    TRASH="$OUT_BASE/.trash-${TAG}-$(date +%Y%m%d%H%M%S)"
    mv "$DIR" "$TRASH" && warn "目标已存在，已挪到 $(basename "$TRASH")"
  else
    err "目标已存在: $DIR"
    dim "要覆盖请加 --force（会先把旧目录挪到 .trash-*，不删除）"
    exit 1
  fi
fi

# ---------- 版本号一致性 ----------
step "版本号一致性"

VER_FAIL=0
check_pkg_version() {
  local f="$1" label="$2"
  if [ ! -f "$f" ]; then
    warn "$label —— 文件不存在，跳过"
    return 0
  fi
  local v
  v=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$f" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  if [ "$v" = "$VER" ]; then
    ok "$label = $v"
  else
    err "$label = ${v:-'(读不到)'}  ≠  $VER"
    VER_FAIL=1
  fi
}

if [ "$SKIP_VERSION" -eq 1 ]; then
  warn "已跳过版本号检查（--skip-version）"
else
  check_pkg_version "$PROJECT_ROOT/package.json"                  "根 package.json"
  check_pkg_version "$PROJECT_ROOT/server/package.json"           "server/package.json"
  check_pkg_version "$PROJECT_ROOT/web/package.json"              "web/package.json"
  check_pkg_version "$PROJECT_ROOT/jianyioa-app/mobile/package.json" "H5 mobile/package.json"
  check_pkg_version "$MP_SRC_PKG"                                 "小程序 mobile/package.json"

  # web/dist 产物里应能搜到版本号（vite define.__APP_VERSION__ 注入）
  if grep -rqF "$VER" "$PROJECT_ROOT/web/dist/assets" 2>/dev/null; then
    ok "web/dist 产物含版本号 $VER"
  else
    warn "web/dist 里搜不到 $VER —— 可能没重新 build，前端页面底部会显示旧版本号"
  fi

  if [ "$VER_FAIL" -ne 0 ]; then
    err "有 package.json 版本号不一致，先统一再出包（或加 --skip-version 强行出）"
    exit 1
  fi
fi

# ---------- 组装 ----------
step "复制 server/（排除式）"
mkdir -p "$DIR/server"
rsync -a \
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules/' \
  --exclude='uploads/' \
  --exclude='/tmp/' \
  --exclude='/tmp' \
  --exclude='_mig_tmp/' \
  --exclude='*.bak' \
  --exclude='*.bak*' \
  --exclude='*.sqlite' \
  --exclude='*.db' \
  --exclude='.DS_Store' \
  --exclude='server.log' \
  --exclude='server_clean.js' \
  --exclude='server_new.js' \
  --exclude='/_*.js' \
  --exclude='/check-*.js' \
  --exclude='/check_*.js' \
  --exclude='/test-*.js' \
  --exclude='/test_*.js' \
  --exclude='/cleanup-test.js' \
  --exclude='/read_sms_config.js' \
  --exclude='/split_*.py' \
  --exclude='*.sql' \
  "$PROJECT_ROOT/server/" "$DIR/server/"
SERVER_FILES=$(find "$DIR/server" -type f | wc -l | tr -d ' ')
ok "server/ 共 $SERVER_FILES 个文件"

# 关键运行时文件点名确认（这些缺了必崩）
for f in server.js db-mysql-async.js material-pinyin.js middleware/perm.js; do
  if [ -f "$DIR/server/$f" ]; then
    ok "  · $f"
  else
    err "  · $f 缺失！"
  fi
done

step "复制 web/dist/"
mkdir -p "$DIR/web"
cp -R "$PROJECT_ROOT/web/dist" "$DIR/web/"
ok "web/dist/ 共 $(find "$DIR/web/dist" -type f | wc -l | tr -d ' ') 个文件"

step "复制 h5/"
mkdir -p "$DIR/h5"
cp -R "$DIR/server/public-mobile-h5/." "$DIR/h5/"
ok "h5/ 共 $(find "$DIR/h5" -type f | wc -l | tr -d ' ') 个文件（与 server/public-mobile-h5 同源）"

step "复制 miniprogram/"
if [ -d "$MP_DIST" ]; then
  mkdir -p "$DIR/miniprogram"
  rsync -a --exclude='.DS_Store' --exclude='node_modules/' "$MP_DIST/" "$DIR/miniprogram/"
  ok "miniprogram/ 共 $(find "$DIR/miniprogram" -type f | wc -l | tr -d ' ') 个文件"
else
  warn "跳过（产物目录不存在）"
fi

# ---------- 依赖完整性断言（防 503 的核心） ----------
step "依赖完整性校验（防 Cannot find module）"
if "$NODE_BIN" "$PROJECT_ROOT/scripts/check-server-deps.js" "$DIR/server"; then
  DEPS_OK=1
else
  DEPS_OK=0
fi

if [ "$DEPS_OK" -ne 1 ]; then
  err "依赖不完整，拒绝出包。包目录留在 $DIR 供排查。"
  exit 1
fi

# ---------- 垃圾/敏感文件断言 ----------
step "敏感与垃圾文件断言"

BAD=0
assert_absent() {
  local pattern="$1" desc="$2" hits
  hits=$(find "$DIR" -name "$pattern" -not -path '*/node_modules/*' 2>/dev/null | head -5)
  if [ -n "$hits" ]; then
    err "$desc 混进包里了："
    printf '%s\n' "$hits" | sed 's/^/        /'
    BAD=1
  fi
}

assert_absent '.env'            '.env（含数据库密码）'
assert_absent 'node_modules'    'node_modules'
assert_absent 'uploads'         'uploads'
assert_absent '*.bak*'          '备份文件'
assert_absent '*.sqlite'        'sqlite 文件'
assert_absent '.DS_Store'       '.DS_Store'

if [ "$BAD" -eq 0 ]; then
  ok "无 .env / node_modules / uploads / 备份文件泄漏"
else
  err "包内有不该带的东西，拒绝出包"
  exit 1
fi

# ---------- 修改记录占位 ----------
if [ ! -f "$DIR/修改记录.md" ]; then
  cat > "$DIR/修改记录.md" <<EOF
# $TAG 修改记录

**修改时间**：$(date '+%Y-%m-%d %H:%M')
**修改类型**：（功能新增 / Bug 修复 / 安全加固）
**改动人**：
**Git 标签**：\`$TAG\`（main）／\`$TAG-mobile\`（mobile）／\`$TAG-mpweixin\`（mp-weixin）
**Git 提交**：

---

## 一、改动内容

（待填）

---

## 二、涉及文件

（待填）

---

## 三、部署步骤

1. 备份服务器 \`D:\\wwwroot\\jianyioa\\\` 现有代码
2. 覆盖 \`server/\`、\`web/dist/\`、\`server/public-mobile-h5/\`
3. \`pm2 restart jianyioa-backend\`
4. 确认 \`/api/health\` 返回 200

---

## 四、检查项

（待填）

---

## 五、注意事项

（待填）

---

## 六、Git

（待填）
EOF
  warn "已生成 修改记录.md 模板，记得手填"
else
  ok "保留已有 修改记录.md"
fi

# ---------- 打包 ----------
if [ "$DO_ZIP" -eq 1 ]; then
  if ! do_zip; then err "zip 打包失败"; exit 1; fi
fi

# ---------- 摘要 ----------
step "出包完成"
printf "  %s%s%s\n" "$C_B" "$DIR" "$C_0"
[ "$DO_ZIP" -eq 1 ] && printf "  %s%s.zip%s\n" "$C_B" "$DIR" "$C_0"
dim "总大小: $(du -sh "$DIR" | awk '{print $1}')"

printf "\n%s下一步（脚本不会自动做）:%s\n" "$C_B" "$C_0"
dim "1. 手填 修改记录.md"
dim "2. 检查 web/dist 和 miniprogram 是否真按本版本 build 过"
dim "3. git add / commit / tag（等大王明示再动）"
printf "\n"
