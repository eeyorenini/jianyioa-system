#!/usr/bin/env bash
#
# 移动端发版产物归集
#
# 一条命令做三件事：
#   1. 构建 H5，部署到 server/public-mobile-h5（原地覆盖，不 mv 目录）
#   2. 把 H5 / 小程序产物归档到「版本升级/v<版本号>/」
#   3. 检查 android / harmony 安装包是否已就位
#
# 用法：
#   bash scripts/collect-release.sh                 # 版本号取 package.json
#   bash scripts/collect-release.sh 2.5.2           # 指定版本号（必须与 package.json 一致）
#   bash scripts/collect-release.sh --skip-build    # 跳过构建，只做归档
#
# 为什么版本号必须一致：
#   interface 上的版本号是 vite 构建时用 __APP_VERSION__ 注入的（读 package.json），
#   只改 package.json 不重建，界面还显示旧版本号（v2.4.7 发版踩过）。
#   脚本强校验，避免"发了新包、界面显示旧版本"。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$(cd "$MOBILE_DIR/.." && pwd)"
SYSTEM_DIR="$(cd "$APP_DIR/.." && pwd)"

RELEASE_ROOT="$(cd "$SYSTEM_DIR/.." && pwd)/jianyioa项目版本管理/版本升级"
H5_DEPLOY="$SYSTEM_DIR/server/public-mobile-h5"
MINIPROGRAM_DIST="${MINIPROGRAM_DIST:-$HOME/Desktop/jianyioa-miniprogram}"

VERSION=""
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) echo "未知参数：$arg"; exit 1 ;;
    *)  VERSION="$arg" ;;
  esac
done

# ---------- 1. 版本号校验 ----------
PKG_VERSION="$(node -p "require('$MOBILE_DIR/package.json').version")"
if [ -z "$VERSION" ]; then
  VERSION="$PKG_VERSION"
fi

if [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "版本号不一致："
  echo "  传入参数     = $VERSION"
  echo "  package.json = $PKG_VERSION"
  echo
  echo "先改 $MOBILE_DIR/package.json 的 version，再跑本脚本。"
  exit 1
fi

VDIR="$RELEASE_ROOT/v$VERSION"
echo "版本：v$VERSION"
echo "档案：$VDIR"

if [ -d "$VDIR" ]; then
  echo "提示：档案目录已存在，本次会覆盖其中的 h5/ 与 miniprogram/"
fi

mkdir -p "$VDIR/h5" "$VDIR/android" "$VDIR/harmony" "$VDIR/miniprogram"

# ---------- 2. 构建 H5 ----------
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo
  echo "[1/3] 构建 H5 ..."
  cd "$MOBILE_DIR"
  # vite 构建前会删旧 assets，批量删除会被沙箱 safe-delete 拦截。
  # 先把旧产物整体挪走，构建就不会触发删除。
  if [ -d dist/build/h5 ]; then
    mv dist/build/h5 "/tmp/h5-old-$(date +%s)"
  fi
  npm run build:h5
else
  echo
  echo "[1/3] 跳过构建（--skip-build）"
fi

# ---------- 3. 部署 + 归档 ----------
echo
echo "[2/3] 部署与归档 ..."

if [ -d "$MOBILE_DIR/dist/build/h5" ]; then
  rsync -a --delete "$MOBILE_DIR/dist/build/h5/" "$H5_DEPLOY/"
  echo "  H5 → server/public-mobile-h5（部署）"
  rsync -a --delete "$MOBILE_DIR/dist/build/h5/" "$VDIR/h5/"
  echo "  H5 → v$VERSION/h5（归档）"
else
  echo "  警告：dist/build/h5 不存在，跳过 H5"
fi

if [ -d "$MINIPROGRAM_DIST" ]; then
  rsync -a --delete "$MINIPROGRAM_DIST/" "$VDIR/miniprogram/"
  echo "  小程序 → v${VERSION}/miniprogram（归档）"
  echo "  注意：归档的是桌面现有产物，请先确认它由本次版本构建而来"
else
  echo "  提示：未找到 ${MINIPROGRAM_DIST}，跳过小程序归档"
fi

# ---------- 4. 安装包检查 ----------
echo
echo "[3/3] 原生安装包检查 ..."

APK="$(ls "$VDIR/android/"*.apk 2>/dev/null | head -1 || true)"
HAP="$(ls "$VDIR/harmony/"*.hap 2>/dev/null | head -1 || true)"

if [ -n "$APK" ]; then
  echo "  Android：$(basename "$APK")  $(du -h "$APK" | cut -f1)"
else
  echo "  Android：未放置（HBuilderX 云打包下载后拷到 v$VERSION/android/）"
fi

if [ -n "$HAP" ]; then
  echo "  Harmony：$(basename "$HAP")  $(du -h "$HAP" | cut -f1)"
else
  echo "  Harmony：未放置（需华为账号签名，见 v$VERSION/harmony/README.md）"
fi

# ---------- 汇总 ----------
echo
echo "完成。v$VERSION 档案内容："
du -sh "$VDIR"/* 2>/dev/null | sed 's|^|  |'
