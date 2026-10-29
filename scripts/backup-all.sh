#!/usr/bin/env bash
# =============================================================================
# 建亿OA 全量备份脚本
# =============================================================================
#
# 备份什么:
#   git/      三个仓库的完整历史（bundle，可 clone 还原）
#   db/       生产库全量 SQL（结构 + 数据，gzip）
#   working/  未提交改动（patch）+ 未跟踪文件
#   config/   server/.env（含数据库密码）
#   MANIFEST.md + SHA256SUMS.txt
#
# 不备份什么（体积大且别处有正本）:
#   server/uploads/   106M，服务器 D:\wwwroot\jianyioa\server\uploads\ 有正本
#   node_modules/     可 npm install 重建
#
# 用法: ./scripts/backup-all.sh [--no-db]
# =============================================================================

set -uo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/Users/gtamer/Desktop/jianyioa-system}"
APP_DIR="$PROJECT_ROOT/jianyioa-app"                      # H5 + 小程序的共享 git 仓
MP_DIR="$HOME/Desktop/jianyioa-mpweixin/mobile"           # 小程序 worktree
BACKUP_BASE="${BACKUP_BASE:-$HOME/Desktop/jianyioa项目版本管理/备份}"
NODE_BIN="${NODE_BIN:-$(command -v node || echo /Users/gtamer/.workbuddy/binaries/node/versions/22.22.2-6/bin/node)}"

DO_DB=1
[ "${1:-}" = "--no-db" ] && DO_DB=0

if [ -t 1 ]; then
  C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_D=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_R=''; C_G=''; C_Y=''; C_D=''; C_B=''; C_0=''
fi
ok()   { printf "  %s✓%s %s\n" "$C_G" "$C_0" "$*"; }
warn() { printf "  %s⚠%s %s\n" "$C_Y" "$C_0" "$*"; }
err()  { printf "  %s✗%s %s\n" "$C_R" "$C_0" "$*"; }
step() { printf "\n%s▸ %s%s\n" "$C_B" "$*" "$C_0"; }

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$BACKUP_BASE/$STAMP"

printf "\n%s═══ 建亿OA 备份 %s ═══%s\n" "$C_B" "$STAMP" "$C_0"
printf "  输出: %s\n" "$DEST"

mkdir -p "$DEST"/{git,db,working,config}

# ---------- 1. git bundle ----------
step "备份 git 历史（bundle）"

bundle_repo() {
  local dir="$1" name="$2" branch="$3"
  if [ ! -d "$dir/.git" ] && [ ! -f "$dir/.git" ]; then
    err "$name —— 不是 git 仓库，跳过"; return 1
  fi
  local head
  head=$(git -C "$dir" rev-parse --short HEAD 2>/dev/null)
  local out="$DEST/git/$name.bundle"
  if git -C "$dir" bundle create "$out" --all >/dev/null 2>&1; then
    local sz=$(du -h "$out" | awk '{print $1}')
    local nrefs=$(git -C "$dir" bundle list-heads "$out" 2>/dev/null | wc -l | tr -d ' ')
    ok "$name.bundle  ($sz, $nrefs 个 ref, HEAD=$head @ $branch)"
  else
    err "$name bundle 失败"; return 1
  fi
}

bundle_repo "$PROJECT_ROOT" "jianyioa-system" "main"
# jianyioa-app 与 jianyioa-mpweixin 是同一个仓的两个 worktree（mobile / mp-weixin），
# --all 会把两个分支一起打包，所以只需打一次
bundle_repo "$APP_DIR" "jianyioa-app" "mobile + mp-weixin"

# ---------- 2. 未提交改动 ----------
step "备份未提交改动"

if git -C "$PROJECT_ROOT" diff --quiet 2>/dev/null && git -C "$PROJECT_ROOT" diff --cached --quiet 2>/dev/null; then
  ok "工作区干净，无 diff"
else
  git -C "$PROJECT_ROOT" diff HEAD > "$DEST/working/uncommitted.patch" 2>/dev/null
  local_sz=$(wc -l < "$DEST/working/uncommitted.patch" | tr -d ' ')
  ok "uncommitted.patch ($local_sz 行)"
fi

# 未跟踪文件（排除 gitignore 的）
UNTRACKED=$(git -C "$PROJECT_ROOT" ls-files --others --exclude-standard)
if [ -n "$UNTRACKED" ]; then
  echo "$UNTRACKED" > "$DEST/working/untracked-list.txt"
  while IFS= read -r f; do
    [ -f "$PROJECT_ROOT/$f" ] || continue
    mkdir -p "$DEST/working/untracked/$(dirname "$f")"
    cp "$PROJECT_ROOT/$f" "$DEST/working/untracked/$f"
  done <<< "$UNTRACKED"
  n=$(echo "$UNTRACKED" | wc -l | tr -d ' ')
  ok "未跟踪文件 $n 个（清单 + 副本）"
else
  ok "无未跟踪文件"
fi

# ---------- 3. 配置 ----------
step "备份配置"
if [ -f "$PROJECT_ROOT/server/.env" ]; then
  cp "$PROJECT_ROOT/server/.env" "$DEST/config/server.env"
  chmod 600 "$DEST/config/server.env"
  ok "server.env（含数据库密码，权限已设 600）"
else
  warn "server/.env 不存在"
fi
[ -f "$PROJECT_ROOT/ecosystem.config.js" ] && cp "$PROJECT_ROOT/ecosystem.config.js" "$DEST/config/" && ok "ecosystem.config.js"

# ---------- 4. 数据库 ----------
if [ "$DO_DB" -eq 1 ]; then
  step "备份生产库"
  DB_OUT="$DEST/db/jianyioa-$STAMP.sql.gz"
  if "$NODE_BIN" "$PROJECT_ROOT/scripts/backup-db.js" "$DEST/db/jianyioa-$STAMP.sql" 2>&1 | tail -4 | sed 's/^/  /'; then
    if [ -f "$DEST/db/jianyioa-$STAMP.sql" ]; then
      gzip -9 "$DEST/db/jianyioa-$STAMP.sql"
      ok "jianyioa-$STAMP.sql.gz ($(du -h "$DB_OUT" | awk '{print $1}'))"
    fi
  else
    err "数据库导出失败（跳过，其他内容已备份）"
  fi
else
  warn "已跳过数据库（--no-db）"
fi

# ---------- 5. MANIFEST ----------
step "生成清单"

P_HEAD=$(git -C "$PROJECT_ROOT" rev-parse HEAD)
P_BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)
A_HEAD=$(git -C "$APP_DIR" rev-parse HEAD)
A_BRANCH=$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)
M_HEAD=$(git -C "$MP_DIR" rev-parse HEAD 2>/dev/null || echo "-")
M_BRANCH=$(git -C "$MP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-")

cat > "$DEST/MANIFEST.md" <<EOF
# 建亿OA 备份清单

**备份时间**：$(date '+%Y-%m-%d %H:%M:%S')
**备份机器**：$(hostname)

## 仓库状态（备份时）

| 仓库 | 分支 | commit |
|---|---|---|
| jianyioa-system（父仓） | $P_BRANCH | \`$P_HEAD\` |
| jianyioa-app（H5） | $A_BRANCH | \`$A_HEAD\` |
| jianyioa-mpweixin（小程序 worktree） | $M_BRANCH | \`$M_HEAD\` |

> jianyioa-app 与 jianyioa-mpweixin 是同一个 git 仓的两个 worktree，
> 分别对应 \`mobile\` 和 \`mp-weixin\` 分支，\`jianyioa-app.bundle\` 已包含两者。

## 内容

\`\`\`
git/
  jianyioa-system.bundle    父仓全部分支 + tag
  jianyioa-app.bundle       H5 + 小程序全部分支 + tag
db/
  jianyioa-*.sql.gz         生产库全量（结构 + 数据）
working/
  uncommitted.patch         未提交改动
  untracked/                未跟踪文件副本
  untracked-list.txt        未跟踪文件清单
config/
  server.env                server/.env（含数据库密码，勿外传）
  ecosystem.config.js       pm2 配置
\`\`\`

## 未备份的内容

| 内容 | 体积 | 正本位置 |
|---|---|---|
| server/uploads/ | 106 MB | 服务器 \`D:\wwwroot\jianyioa\server\uploads\\\` |
| node_modules/ | - | \`npm install\` 可重建 |
| 升级包 | - | \`~/Desktop/jianyioa项目版本管理/版本升级/\` |

## 还原方法

### 代码

\`\`\`bash
# 从 bundle 克隆（含全部历史）
git clone git/jianyioa-system.bundle jianyioa-system-restored
cd jianyioa-system-restored
git remote set-url origin git@github.com:eeyorenini/jianyioa-system.git

# 或者只取回某个分支/标签
git fetch /path/to/jianyioa-system.bundle 'refs/tags/*:refs/tags/*'
\`\`\`

### 数据库

\`\`\`bash
gunzip -c db/jianyioa-*.sql.gz | mysql -u root -p jianyioa
\`\`\`

### 未提交改动

\`\`\`bash
cd jianyioa-system
git apply working/uncommitted.patch
cp -R working/untracked/* .
\`\`\`

### 校验完整性

\`\`\`bash
shasum -a 256 -c SHA256SUMS.txt
\`\`\`
EOF

ok "MANIFEST.md"

# ---------- 6. 校验和 ----------
step "生成校验和"
( cd "$DEST" && find . -type f ! -name 'SHA256SUMS.txt' -print0 | xargs -0 shasum -a 256 > SHA256SUMS.txt )
ok "SHA256SUMS.txt（$(wc -l < "$DEST/SHA256SUMS.txt" | tr -d ' ') 个文件）"

# ---------- 7. 验证 bundle 可读 ----------
step "验证备份可用性"
for b in "$DEST"/git/*.bundle; do
  [ -f "$b" ] || continue
  if git bundle verify "$b" >/dev/null 2>&1; then
    ok "$(basename "$b") 校验通过（可正常 clone）"
  else
    err "$(basename "$b") 校验失败！"
  fi
done

if ls "$DEST"/db/*.sql.gz >/dev/null 2>&1; then
  if gzip -t "$DEST"/db/*.sql.gz 2>/dev/null; then
    ok "数据库备份 gzip 完整性通过"
  else
    err "数据库备份 gzip 损坏"
  fi
fi

# ---------- 摘要 ----------
step "完成"
printf "  %s%s%s\n" "$C_B" "$DEST" "$C_0"
printf "  总体积: %s\n" "$(du -sh "$DEST" | awk '{print $1}')"
printf "\n"
