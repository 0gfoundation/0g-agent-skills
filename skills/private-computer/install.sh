#!/bin/sh
# install.sh — put Claude Code on 0G Private Computer, in one command.
#
#   curl -fsSL https://raw.githubusercontent.com/0gfoundation/0g-pc-skills/main/install.sh \
#     | bash -s claude --key sk-…
#
# The pc.0g.ai Quick Start card serves this same file from https://pc.0g.ai/install with the
# user's key filled in. Both are this script; see docs/install-contract.md.
#
# Writes .claude/settings.local.json in the current project, plus one line in
# .claude/.gitignore, and nothing else. Neither .claude/settings.json nor your
# global ~/.claude/settings.json is ever touched.
set -eu

BASE_URL="${ZG_BASE_URL:-https://raw.githubusercontent.com/0gfoundation/0g-pc-skills/main}"
ROUTER="${ZG_ROUTER:-https://router-api.0g.ai}"

# >>> generated from configs/claude/settings.json — do not edit by hand >>>
# 卸载要能在断网时用：契约承诺它不需要 key，而一个要联网才能撤销的安装同样不合格。
# 所以这里带一份发布时固定的地址。它是离线读数，不是第二个可以独立维护的口径——
# tools/sync-router-url.sh 从模板生成它，tests/install.sh 删掉再生成再比对。
# 重新生成：sh tools/sync-router-url.sh
ROUTER_URL="https://router-api.0g.ai"
# <<< generated <<<

# >>> field classes >>>
# 受管字段与它们的归属。安装器只碰这张表里的东西，其余一律不动。
# 每个字段都得说得出为什么在这里——说不出的就不该写进用户的项目。
# tests/install.sh 断言这张表与 configs/claude/settings.json 双向对齐。
#
# 凭据：总是覆盖。轮换 key 就是要换它。
#   env.ANTHROPIC_AUTH_TOKEN  凭据本身。模板里没有，由 --key 在运行时注入。
FIELDS_CREDENTIAL="env.ANTHROPIC_AUTH_TOKEN"
FIELDS_RUNTIME_ONLY="env.ANTHROPIC_AUTH_TOKEN"
#
# 接入点：决定这个项目归谁。别人的值在这里，就代表这个项目不归我们，安装器停手。
#   env.ANTHROPIC_BASE_URL  请求发去哪；同时是绑定的钥匙。
#   env.ANTHROPIC_API_KEY   置空，挡住 Claude Code 回落到用户自己的 Anthropic 凭据
#                           并把它发给 0G 的 router——那读起来像账号坏了。
FIELDS_ENDPOINT="env.ANTHROPIC_BASE_URL env.ANTHROPIC_API_KEY"
#
# 偏好：只在缺失时写。已经有值就是用户的选择，包括他用 /0g-pc-switch-model 换过的模型。
#   env.ANTHROPIC_MODEL                  主模型。router 服务的模型名与 Anthropic 的不同，
#                                        不写就没有一个叫得动的模型。
#   env.ANTHROPIC_DEFAULT_FABLE_MODEL    三个档位各自的落点。不写，该档会去要一个 router
#   env.ANTHROPIC_DEFAULT_OPUS_MODEL     没有的名字，错误发生在用户切档的那一刻而不是装的时候。
#   env.ANTHROPIC_DEFAULT_HAIKU_MODEL
#   env.CLAUDE_CODE_MAX_CONTEXT_TOKENS   按 router 报的 context_length 算出来。不写则按 200k
#                                        压缩，把买到的窗口白白丢掉。
#   fallbackModel                        主模型 529 时的去处。
#   modelOverrides                       把客户端认识的 id 映射成 router 的 provider id；
#                                        权限门那一档靠它才有模型可用。
FIELDS_PREFERENCE="env.ANTHROPIC_MODEL env.ANTHROPIC_DEFAULT_FABLE_MODEL env.ANTHROPIC_DEFAULT_OPUS_MODEL env.ANTHROPIC_DEFAULT_HAIKU_MODEL env.CLAUDE_CODE_MAX_CONTEXT_TOKENS fallbackModel modelOverrides"
# <<< field classes <<<

SETTINGS=".claude/settings.json"
LOCAL=".claude/settings.local.json"
BACKUP=".claude/settings.json.0g-backup"

# The three Claude Code skills, and where they go. ZG_SKILLS_DIR exists so the tests
# can point this somewhere harmless; Claude Code itself reads ~/.claude/skills.
SKILLS="setup switch-model uninstall"
SKILLS_DIR="${ZG_SKILLS_DIR:-$HOME/.claude/skills}"
RETIRED="0g-pc-model-config-claude"

die() { printf '%s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*" >&2; }

usage() {
    cat <<'EOF'
Put Claude Code on 0G Private Computer.

  install.sh claude --key <YOUR_API_KEY>    install into the current project
  install.sh claude --key -                 read the key from the terminal instead,
                                            keeping it out of your shell history
  install.sh claude --uninstall             remove it again
  install.sh skills                         install the three slash commands
  install.sh skills --uninstall             remove them again
  install.sh --help

Get a key at https://pc.0g.ai → Dashboard → API Keys.

Writes .claude/settings.local.json (config and key together, mode 600) and one
line in .claude/.gitignore so git leaves it alone. Nothing it writes is meant
to be committed: which router this machine talks to is your decision, not the
repository's. .claude/settings.json is never written, and neither is your
global ~/.claude/settings.json.

Claude Code has to be installed already — this will not install it for you.
Run it from the project you want on 0G; it refuses to run in your home
directory, where .claude/ is the global configuration rather than a project.

'skills' is the one subcommand that writes outside the project: it puts
/0g-pc-setup, /0g-pc-switch-model and /0g-pc-uninstall in ~/.claude/skills,
where Claude Code looks for them. It takes no key.
EOF
}

# ---------------------------------------------------------------- arguments

CLIENT=""
KEY=""
MODE="install"

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)   usage; exit 0 ;;
        --uninstall) MODE="uninstall" ;;
        --key)
            [ $# -ge 2 ] || die "--key needs a value (or - to be prompted). Try --help."
            KEY="$2"; shift ;;
        --key=*)     KEY="${1#--key=}" ;;
        -*)          die "unknown option: $1. Try --help." ;;
        *)
            [ -z "$CLIENT" ] || die "unexpected argument: $1. Try --help."
            CLIENT="$1" ;;
    esac
    shift
done

[ -n "$CLIENT" ] || { usage >&2; die "
which client? Only 'claude' is supported today."; }

case "$CLIENT" in
    claude) ;;
    skills) ;;
    opencode|hermes|pi) die "$CLIENT is not supported yet — it has not been investigated.
The README has a slot for it: https://github.com/0gfoundation/0g-pc-skills#readme" ;;
    codex|gemini|curl) die "$CLIENT is not supported yet. Only 'claude' is." ;;
    *)      die "unknown client: $CLIENT. Only 'claude' is supported today." ;;
esac

have() { command -v "$1" >/dev/null 2>&1; }
have python3 || die "python3 is required and was not found."

# ------------------------------------------------------------------ skills

if [ "$CLIENT" = skills ]; then
    [ -z "$KEY" ] || die "skills takes no key — the slash commands never see one."

    if [ "$MODE" = uninstall ]; then
        gone=0
        for s in $SKILLS; do
            d="$SKILLS_DIR/0g-pc-$s"
            if [ -d "$d" ]; then rm -rf "$d"; gone=$((gone + 1)); fi
        done
        [ "$gone" -gt 0 ] && note "removed $gone skill(s) from $SKILLS_DIR." \
                          || note "nothing to remove — none of the three are installed."
        exit 0
    fi

    mkdir -p "$SKILLS_DIR"
    for s in $SKILLS; do
        d="$SKILLS_DIR/0g-pc-$s"
        mkdir -p "$d"
        tmp="$(mktemp)"
        curl -fsSL "$BASE_URL/skills/0g-pc-$s/SKILL.md" -o "$tmp" \
            || { rm -f "$tmp"; die "could not fetch 0g-pc-$s from $BASE_URL — check your connection."; }
        head -n 1 "$tmp" | grep -q '^---$' \
            || { rm -f "$tmp"; die "what came back for 0g-pc-$s is not a skill file."; }
        mv -f "$tmp" "$d/SKILL.md"
    done
    note "installed: /0g-pc-setup, /0g-pc-switch-model, /0g-pc-uninstall
They register without a restart. Ask for one by name, or type / to see them."

    # The skill these three replaced. Deleting someone's home directory is not this
    # script's call, but leaving them unwarned is worse: it still wins requests from
    # all three, and the setup it describes now ends at "Not logged in".
    if [ -d "$SKILLS_DIR/$RETIRED" ]; then
        note "
$RETIRED is still installed and competes with all three.
It also teaches a setup that no longer works. Remove it with:

  rm -rf $SKILLS_DIR/$RETIRED"
    fi
    exit 0
fi


# ----------------------------------------------------------------- ignore

CLAUDE_GITIGNORE=".claude/.gitignore"
IGNORE_LINE="settings.local.json*"

# 忽略规则写在 .claude/ 里，不写项目根 .gitignore，也不碰 .git/。
#
# .git/info/exclude 看着更"干净"（工作区零痕迹），但它的真实路径由 git 决定：仓库子目录、
# linked worktree、--separate-git-dir 三种布局下都解析到 cwd 之外。而"只写当前项目"是契约
# 承诺的五条之一，于是那条路只剩两个选择——破承诺，或者在这些很常见的布局里拒绝安装。
# .claude/.gitignore 两个都不用选：它始终在 cwd 里，对所有布局一视同仁，而且目录还不是 git
# 仓库时照样能写——用户以后 git init，保护自动生效。
#
# 写的是通用的一行，不带 0G 标记：它保护的是 Claude Code 的个人设置文件，与用不用 0G 无关。
# 所以卸载不删它——删掉才是有害的那一步。被用户提交也无妨，内容里没有任何 0G 字样。
IGNORE_WRITTEN=0
claude_gitignore_add() {
    # 任何来源已经盖住就一个字都不写。用户的全局 ignore 常常已经带了这一条，
    # 那时候再追加只是往人家项目里塞一个没用的文件。
    #
    # "盖住"必须同时包含最终路径和写入时的临时路径。常见的全局规则是
    # **/.claude/settings.local.json —— 精确到最终那一个文件名，盖不住 .tmp 后缀的中间态。
    # 只查最终路径就会在这类机器上判成"已有保护"而直接返回，把带凭据的临时文件漏在外面。
    if have git && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        if git check-ignore -q "$LOCAL" 2>/dev/null \
        && git check-ignore -q "$LOCAL.tmp" 2>/dev/null; then
            return 0
        fi
    fi

    mkdir -p .claude
    if [ -f "$CLAUDE_GITIGNORE" ] && grep -qxF "$IGNORE_LINE" "$CLAUDE_GITIGNORE"; then
        return 0
    fi
    [ ! -f "$CLAUDE_GITIGNORE" ] || [ -z "$(tail -c 1 "$CLAUDE_GITIGNORE")" ] \
        || printf '\n' >> "$CLAUDE_GITIGNORE"
    printf '%s\n' "$IGNORE_LINE" >> "$CLAUDE_GITIGNORE"
    IGNORE_WRITTEN=1

    # 追加成功不等于保护成功——项目里别处的规则可能把它抵消掉。查一次实际效果。
    if have git && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git check-ignore -q "$LOCAL" 2>/dev/null || die "wrote $CLAUDE_GITIGNORE but git still does not
ignore $LOCAL. Something else in this repository is re-including it. Nothing
else has been written; sort that out and run this again."
    fi
}


# --------------------------------------------------------------- uninstall

if [ "$MODE" = uninstall ]; then
    # 同一把钥匙：接入点是我们的，就把整个白名单一起摘掉，不看值；不是我们的，就什么都不碰。
    #
    # 不看值是有意的。用户用 /0g-pc-switch-model 换过的模型是"0G 之内"的选择——0G 撤了，
    # 它就没有意义，留下只会变成一个指向 0G 的孤儿字段，把回到 Anthropic 那条路弄坏。
    # 所以不需要 hash 比对，也不需要问。
    #
    # settings.json 不在写入路径上，也就不在卸载路径上。旧版会在没有备份时 rm -f 它——
    # 那正是 #116：一个从未装过 0G、只是碰巧有 settings.json 的项目，卸一次就没了。
    #
    # .claude/.gitignore 也不删。它保护的是 Claude Code 的个人设置文件，与用不用 0G 无关；
    # local 摘完往往还在（用户自己的键、Claude Code 写的 permissions.allow），撤掉保护
    # 比留一行无害规则糟得多。
    FIELDS_ALL="$FIELDS_CREDENTIAL $FIELDS_ENDPOINT $FIELDS_PREFERENCE"
    outcome="$(FIELDS_ALL="$FIELDS_ALL" python3 - "$LOCAL" "$SETTINGS" "$BACKUP" "$ROUTER_URL" <<'PY'
import json, os, pathlib, sys

local_p, settings_p, backup_p, ours = (*(pathlib.Path(a) for a in sys.argv[1:4]), sys.argv[4])
managed = os.environ["FIELDS_ALL"].split()

def out(word):
    print(word)
    raise SystemExit(0)

# 旧布局：停，保留现场。旧备份与现配置不足以重建当时写出的状态，自动还原会把用户
# 装完之后自己往 settings.json 里加的东西无商量地丢掉。
if backup_p.exists():
    out("oldlayout")

def load(path):
    if not path.exists():
        return {}
    try:
        doc = json.loads(path.read_text())
    except Exception:
        return None
    return doc if isinstance(doc, dict) else None

proj = load(settings_p)
if proj is None:
    out("unreadable-project")

proj_env = proj.get("env")
if isinstance(proj_env, dict) and proj_env.get("ANTHROPIC_BASE_URL") == ours:
    out("oldlayout")

doc = load(local_p)
if doc is None:
    out("unreadable-local")
if not local_p.exists():
    out("nothing")

env = doc.get("env")
bound = isinstance(env, dict) and env.get("ANTHROPIC_BASE_URL") == ours
if not bound:
    out("notours")

def drop(path):
    parts = path.split(".")
    node = doc
    for part in parts[:-1]:
        node = node.get(part) if isinstance(node, dict) else None
        if not isinstance(node, dict):
            return
    node.pop(parts[-1], None)

for path in managed:
    drop(path)
if isinstance(doc.get("env"), dict) and not doc["env"]:
    doc.pop("env", None)

if doc:
    local_p.write_text(json.dumps(doc, indent=2) + "\n")
    out("removed-kept")
local_p.unlink()
out("removed-gone")
PY
)" || die "could not read this project's configuration."

    case "$outcome" in
        oldlayout) die "this project is on the layout an earlier version of this installer wrote,
and that layout is not safe to undo automatically: the backup and the current
$SETTINGS together are not enough to rebuild what that install wrote, so putting
the backup back would silently drop anything you added afterwards.

Nothing has been changed. Move the 0G fields out of $SETTINGS by hand — no
credential is involved and none is needed to do it." ;;
        unreadable-*) die "this project's configuration is not valid JSON. Refusing to guess what it
meant — nothing has been changed." ;;
        notours|nothing)
            note "nothing to remove here — this project is not on 0G." ;;
        removed-kept)
            note "removed. Your own settings in $LOCAL are untouched, and the line in
.claude/.gitignore stays: it keeps Claude Code's personal settings out of git
whether or not you use 0G. Your key is gone, so there is nothing to unset —
start Claude Code in a new terminal and it is back on the Anthropic API." ;;
        removed-gone)
            note "removed — $LOCAL held nothing but the 0G config, so it is gone. The line in
.claude/.gitignore stays: it keeps Claude Code's personal settings out of git
whether or not you use 0G. Your key is gone, so there is nothing to unset —
start Claude Code in a new terminal and it is back on the Anthropic API." ;;
    esac
    exit 0
fi

# --------------------------------------------------------------------- key

if [ "$KEY" = "-" ]; then
    if [ -r /dev/tty ]; then
        printf 'Paste your 0G API key (not shown): ' > /dev/tty
        stty -echo < /dev/tty 2>/dev/null || true
        read -r KEY < /dev/tty || true
        stty echo < /dev/tty 2>/dev/null || true
        printf '\n' > /dev/tty
    else
        read -r KEY || true
    fi
fi

[ -n "$KEY" ] || die "no key. Pass --key sk-… , or --key - to be prompted for it.
Get one at https://pc.0g.ai → Dashboard → API Keys."

case "$KEY" in
    sk-*) ;;
    *) die "that does not look like a 0G key — they start with 'sk-'." ;;
esac

# ---------------------------------------------------------------- preflight

# 在家目录里跑，.claude/settings.local.json 就落在 ~/.claude/ 下——"只写当前项目"
# 会静默变成"写全局"，而那正是这个脚本反复承诺不做的事。契约要求卡片上写"从你的项目
# 目录里跑"，说明这个坑已经被踩到；页面文案挡不住已经贴进终端的那一次。
if [ "$(pwd -P)" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; then
    die "this is your home directory. Installing here would put the config in
~/.claude/, which is your global Claude Code configuration — not a project.
cd into the project you want on 0G and run it there."
fi

# .gitignore does nothing for a file git already tracks, so refuse to write a key
# into one. This is the case where the usual fix looks applied and is not.
if have git && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git ls-files --error-unmatch "$LOCAL" >/dev/null 2>&1; then
        die "$LOCAL is tracked by git. Writing your key into it would put it one
commit from being pushed, and .gitignore does not help with a file git already
tracks. Run this first:

  git rm --cached $LOCAL"
    fi
fi

# 不代装。全局 npm 安装是这个脚本里唯一一个写在项目之外、且 --uninstall 撤不回来的
# 动作——用户粘贴的是"把这个项目接到 0G"，不该顺带在机器上留下一个全局包。何况它连
# 一步都没省：没装 claude 的人，装完 0G 照样要再敲一次命令才用得上。
have claude || die "Claude Code is not installed. Install it first:

  npm install -g @anthropic-ai/claude-code

then run this again. (It needs Node.js; this script will not install either for
you — a global npm install is not something one pasted command should leave
behind, and --uninstall could not take it back.)"

# -------------------------------------------------------------- 归属判定

# 这个项目归谁，只看待修改的那个文件自己的接入点，逐字相等。不把别处的层合并进来
# 取得写入依据：合并之后指向 0G，不等于这个文件里的字段是我们写的。
#
# 判据是字面相等而不是"看起来像 0G"。模糊判据没法安置旧地址那一类情形，也写不出
# 能触发自己的测试用例。
#
# 只判定，不写入——写入路径在另一条改动里。
tmp_cfg="$(mktemp)"
trap 'rm -f "$tmp_cfg"' EXIT INT TERM
curl -fsSL "$BASE_URL/configs/claude/settings.json" -o "$tmp_cfg" \
    || die "could not fetch the config from $BASE_URL — check your connection."
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$tmp_cfg" \
    || die "the config fetched from $BASE_URL is not valid JSON."

# 取回来的配置认不认得——不是它是哪个版本。
#
# 比版本要看 portal 什么时候发布：契约允许 portal 在 build 时拷贝 install.sh 自行托管，
# 那份拷贝一旦落后于 main 的 configs/，版本判定会把每一个从 pc.0g.ai 来的安装都打掉。
# 那是我们看不见也管不着的第三方状态，纯函数的输出不该取决于别人何时发布。
#
# 能回答的是本地的问题：这份配置里的每个字段，脚本知不知道该怎么写？只是值变了
# （模型名、上下文上限）就照装，那本来就是配置该干的事。
#
# 接入点另算：它必须逐字等于脚本自带的基准。配置是从网上取的，而它决定用户的 key
# 下一次发去哪里——这一条比对是那条路上唯一的销子。
FIELDS_ALL="$FIELDS_CREDENTIAL $FIELDS_ENDPOINT $FIELDS_PREFERENCE"
FIELDS_ALL="$FIELDS_ALL" python3 - "$tmp_cfg" "$ROUTER_URL" <<'PYCAP' || exit 1
import json, os, pathlib, sys

cfg = json.loads(pathlib.Path(sys.argv[1]).read_text())
baseline, known = sys.argv[2], set(os.environ["FIELDS_ALL"].split())

paths = set()
for k, v in cfg.items():
    if k == "env" and isinstance(v, dict):
        paths.update("env." + s for s in v)
    else:
        paths.add(k)

unknown = sorted(paths - known)
if unknown:
    sys.exit("the config fetched from the release carries fields this installer does not\n"
             "  know how to write:\n" + "".join(f"    {p}\n" for p in unknown) +
             "  Nothing has been changed. Take install.sh from the same release as the\n"
             "  config, or wait for one that knows about them.")

base = (cfg.get("env") or {}).get("ANTHROPIC_BASE_URL")
if base != baseline:
    sys.exit(f'the config fetched from the release points at "{base}", but this installer\n'
             f'  was released against "{baseline}". Nothing has been changed — a config that\n'
             "  redirects the endpoint is the one thing that must not be taken on trust,\n"
             "  because your key goes wherever it says on the next request.")
PYCAP

FIELDS_ALL="$FIELDS_CREDENTIAL $FIELDS_ENDPOINT $FIELDS_PREFERENCE"
FIELDS_ALL="$FIELDS_ALL" python3 - "$tmp_cfg" "$LOCAL" "$SETTINGS" "$BACKUP" <<'PY' || exit 1
import json, os, pathlib, sys

tmpl_p, local_p, settings_p, backup_p = (pathlib.Path(a) for a in sys.argv[1:5])
managed = os.environ["FIELDS_ALL"].split()
tmpl = json.loads(tmpl_p.read_text())
ours = (tmpl.get("env") or {}).get("ANTHROPIC_BASE_URL")

def die(msg):
    print(msg, file=sys.stderr)
    raise SystemExit(1)

def load(path):
    """返回 (doc, 错误说明)。不存在按空配置算；读不出来不能当成空的。"""
    if not path.exists():
        return {}, None
    try:
        doc = json.loads(path.read_text())
    except Exception as exc:
        return None, f"{path} is not valid JSON ({exc})"
    if not isinstance(doc, dict):
        return None, f"{path} is not a JSON object"
    return doc, None

def get(doc, path):
    """字段路径是否存在。空字符串与 null 都算存在——它们是有人设过的痕迹。"""
    parts = path.split(".")
    node = doc
    for part in parts[:-1]:
        node = node.get(part) if isinstance(node, dict) else None
        if node is None:
            return False, False
    if not isinstance(node, dict):
        return False, True          # 父节点类型不对
    return parts[-1] in node, False

# 旧的双文件布局优先拦下。它不是"别人的地址"，是我们自己上一版留下的现场，
# 而那个现场不足以重建当时写出的中间状态——自动还原会把用户装完之后自己往
# settings.json 里加的东西无商量地丢掉。
proj, err = load(settings_p)
if err:
    die(f"{err}\n  Refusing to guess what it meant. Fix or move it, then run this again.")
proj_base = (proj.get("env") or {}).get("ANTHROPIC_BASE_URL") if isinstance(proj.get("env"), dict) else None
if proj_base == ours or backup_p.exists():
    lines = [f"this project is on the layout an earlier version of this installer wrote:",
             f"  {settings_p}  holds the 0G config (it should not be committed)"]
    if backup_p.exists():
        lines.append(f"  {backup_p}  holds whatever was there before that install")
    lines += ["",
              "Nothing has been changed. The two files are not enough to rebuild what that",
              "install wrote, so putting the backup back would silently drop anything you",
              "added to settings.json yourself afterwards.",
              "",
              "Move the 0G fields into .claude/settings.local.json by hand, or ask for help",
              "with them — then run this again. No credential is shown above and none is",
              "needed to do it."]
    die("\n".join(lines))

local, err = load(local_p)
if err:
    die(f"{err}\n  Refusing to treat an unreadable config as an empty one — that is how a\n"
        "  credential someone else put there gets overwritten.")

base_present, bad_parent = get(local, "env.ANTHROPIC_BASE_URL")
if bad_parent:
    die(f'{local_p} has an "env" that is not an object.\n'
        "  Refusing to guess what it meant.")
base = (local.get("env") or {}).get("ANTHROPIC_BASE_URL") if base_present else None

if base_present and base == ours:
    raise SystemExit(0)                     # 我们的，继续

if base_present:
    die(f'{local_p} already points at "{base}".\n'
        f'  This project is bound to something else; expected exactly "{ours}".\n'
        "  Nothing has been changed. Remove that line to use 0G here, or run this in\n"
        "  the project you meant.")

# 没有接入点。只有当受管字段一个都不在时，这里才算全新——没有 URL 不代表没有配置，
# 而"用官方 API、key 就放在这个文件里"恰恰是最常见的那一种。
occupied = [p for p in managed if get(local, p)[0]]
if occupied:
    die(f"{local_p} has no ANTHROPIC_BASE_URL, but it already carries fields this\n"
        "  installer writes:\n" + "".join(f"    {p}\n" for p in sorted(occupied)) +
        "  Nothing has been changed. Overwriting them would take out a configuration\n"
        "  nobody here can put back.")

raise SystemExit(0)                         # 全新，继续
PY

# ------------------------------------------------- resolve the model / ceiling

# 模型名与上下文上限都从 router 取，而不是写死在这个脚本里：写死的名字会活得比它在
# router 上的存在更久，然后把每一次安装都变成"你的 key 被拒了"的报告。
if ! MODEL="$(python3 - "$tmp_cfg" "$ROUTER" <<'PY'
import json, pathlib, sys, urllib.request
p = pathlib.Path(sys.argv[1])
cfg = json.loads(p.read_text())
model = (cfg.get("env") or {}).get("ANTHROPIC_MODEL")
if not model:
    sys.exit("the config carries no ANTHROPIC_MODEL — nothing to install.")
try:
    with urllib.request.urlopen(sys.argv[2] + "/v1/models", timeout=20) as r:
        live = {m["id"]: m for m in json.load(r)["data"]}
except Exception:
    live = {}                      # offline: keep the shipped ceiling and let the key check report
if live:
    m = live.get(model)
    if m is None:
        sys.exit(f"the config asks for {model}, which the router does not serve right now.\n"
                 f"This is not a problem with your key. See {sys.argv[2]}/v1/models")
    if "anthropic" not in (m.get("supported_formats") or []):
        sys.exit(f"the router serves {model} in "
                 f"{'+'.join(m.get('supported_formats') or ['no'])} format only, which a direct\n"
                 "config cannot reach. This is not a problem with your key.")
    ctx = m.get("context_length")
    if ctx:
        cfg["env"]["CLAUDE_CODE_MAX_CONTEXT_TOKENS"] = str(ctx * 15 // 16)
        p.write_text(json.dumps(cfg, indent=2) + "\n")
print(model)
PY
)"; then
    die "the config could not be prepared."
fi

# ------------------------------------------------------- validate the key

note "checking the key against the router…"
# `|| status=000` sits OUTSIDE the substitution on purpose. Inside it, curl writes its own
# "000" via -w AND exits non-zero, so the fallback appended a second one and every
# unreachable router produced "000000" — which matched no case arm, leaving the 000 message
# below unreachable. Out here the assignment is replaced whole, so $status is always 3 chars.
# The || is still required: set -e would abort on curl's non-zero exit without it.
status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    -X POST "$ROUTER/v1/messages" \
    -H "Authorization: Bearer $KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "{\"model\":\"$MODEL\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\".\"}]}")" \
    || status=000

# 能远程失败的事情全部发生在写之前，所以这些分支停下来时，项目里一个文件都没动过。
# 402 是例外：配置是对的、key 是对的，只是账户没钱——那不是"没装上"。退出码回答的是
# "装没装上"，不是"能不能用"，所以它照装不误，充值提示留到最后。
LOW_BALANCE=0
case "$status" in
    200) ;;
    402) LOW_BALANCE=1 ;;
    401) die "the router rejected this key (401). Nothing has been written.
Check it at https://pc.0g.ai → Dashboard → API Keys, then run this again." ;;
    000) die "the router could not be reached to check the key. Nothing has been
written. Verify with: curl -s $ROUTER/v1/models" ;;
    *)   die "the router answered $status when checking the key. Nothing has been
written. Try again, or see https://pc.0g.ai/dashboard/overview" ;;
esac

# ------------------------------------------------------------------- write

mkdir -p .claude

# 先保护，后提交：凭据落盘之前，忽略规则必须已经建立并验证过。
claude_gitignore_add

# 按字段写进 local，不碰 settings.json。三类各有各的规矩：
#   凭据   —— 总是覆盖，轮换 key 就是要换它
#   接入点 —— 从模板写；绑定判定已经保证这里要么空着、要么已经等于模板的值
#   偏好   —— 只在缺失时写。已经有值就是用户的选择，包括他用 /0g-pc-switch-model 换过的模型
# 白名单以外的字段原样保留——Claude Code 自己会往这个文件里写 permissions.allow。
FIELDS_WRITTEN="$(KEY="$KEY" FIELDS_CREDENTIAL="$FIELDS_CREDENTIAL" FIELDS_ENDPOINT="$FIELDS_ENDPOINT" \
FIELDS_PREFERENCE="$FIELDS_PREFERENCE" python3 - "$tmp_cfg" "$LOCAL" <<'PY'
import json, os, pathlib, sys, tempfile

tmpl = json.loads(pathlib.Path(sys.argv[1]).read_text())
target = pathlib.Path(sys.argv[2])
classes = {n: os.environ[f"FIELDS_{n}"].split() for n in ("CREDENTIAL", "ENDPOINT", "PREFERENCE")}

try:
    doc = json.loads(target.read_text())
    if not isinstance(doc, dict):
        doc = {}
except Exception:
    doc = {}

def walk(root, path, create=False):
    parts = path.split(".")
    node = root
    for part in parts[:-1]:
        if part not in node or not isinstance(node[part], dict):
            if not create:
                return None, None
            node[part] = {}
        node = node[part]
    return node, parts[-1]

def value_from_template(path):
    node, leaf = walk(tmpl, path)
    return None if node is None else node.get(leaf)

def present(path):
    node, leaf = walk(doc, path)
    return node is not None and leaf in node

def put(path, value):
    node, leaf = walk(doc, path, create=True)
    node[leaf] = value

written = []
for path in classes["CREDENTIAL"]:
    put(path, os.environ["KEY"])            # 总是覆盖
    written.append(path)
for path in classes["ENDPOINT"]:
    v = value_from_template(path)
    if v is not None:
        put(path, v)
        written.append(path)
for path in classes["PREFERENCE"]:
    if present(path):
        continue                            # 用户的选择，不碰
    v = value_from_template(path)
    if v is not None:
        put(path, v)
        written.append(path)

# 原子替换：临时文件与目标同目录（同一个文件系统），从创建起就是 600，
# 内容齐了再 rename。提交点只有这一次 rename——它之前的失败保住旧配置与旧 key。
target.parent.mkdir(parents=True, exist_ok=True)
fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=target.name + ".tmp")
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(json.dumps(doc, indent=2) + "\n")
    os.replace(tmp, target)
except BaseException:
    os.unlink(tmp)
    raise

# 交代块要列的是这一次真的写了哪些——偏好只在缺失时写，重跑时它们多半没动。
print("\n".join(written))
PY
)" || die "could not write $LOCAL."
chmod 600 "$LOCAL"


# -------------------------------------------------------------- self-check

tmp_chk="$(mktemp)"
trap 'rm -f "$tmp_cfg" "$tmp_chk"' EXIT INT TERM
if curl -fsSL "$BASE_URL/check-0g.sh" -o "$tmp_chk" 2>/dev/null; then
    # 只报告。配置已经写好、key 也验过了，自检发现的是"装好了但有地方不对"，
    # 不是"没装上"。让它有否决权，就会把一次正确的安装判成失败——布局一变更是如此。
    sh "$tmp_chk" || note "the checks above found something worth looking at. The
config is written and the key works; nothing here needs re-running."
fi

# ---------------------------------------------------------------- 交代

# 新布局写的是一个不进 git、600、用户平时不会打开的文件。旧布局至少 git diff 看得见，
# 现在看不见了——所以结尾要交代清楚动了什么。这不是交互，是交代。
#
# 六项固定：文件、字段、怎么看、怎么撤、skills 下一步、以后怎么再查。
# 本次新建了 .claude/.gitignore 的话一并列出——它也是我们放进人家项目里的东西。

WROTE_IGNORE=""
[ "$IGNORE_WRITTEN" = 1 ] && WROTE_IGNORE="
  $CLAUDE_GITIGNORE            one line, so git keeps the file above out of commits"

# 列的是这一次真的写了哪些。偏好只在缺失时写，所以重跑时这份清单会比全量短——
# 那正是该让人看见的事实。
FIELDS_SHOWN="$(printf '%s\n' "$FIELDS_WRITTEN" | grep . | sed 's/^/    /')"

# 三条 slash 命令是另一条命令——它们装在 $SKILLS_DIR，不在项目里。已经装齐的人不必再看见这段。
missing=0
for s in $SKILLS; do
    [ -d "$SKILLS_DIR/0g-pc-$s" ] || missing=$((missing + 1))
done

if [ "$missing" -gt 0 ]; then
    SKILLS_NOTE="Next, if you want them: /0g-pc-setup, /0g-pc-switch-model and
  /0g-pc-uninstall. They go in $SKILLS_DIR rather than in the project, so
  they are a second command, and it takes no key:

    curl -fsSL $BASE_URL/install.sh | bash -s skills"
else
    SKILLS_NOTE="The three slash commands are already installed: /0g-pc-setup,
  /0g-pc-switch-model, /0g-pc-uninstall."
fi

if [ "$LOW_BALANCE" = 1 ]; then
    note "the key is valid, but the account has no balance (402). The config below is
written and correct — top up at https://pc.0g.ai/dashboard/overview and you are
done; nothing here needs changing."
fi

note "done. Claude Code is on 0G in this project. Start it in any terminal — no
export needed:

  claude

What was written
  $LOCAL$WROTE_IGNORE

Fields set in it
$FIELDS_SHOWN

See it
  cat $LOCAL

Undo it
  install.sh claude --uninstall

Slash commands
  $SKILLS_NOTE

Check it later
  curl -fsSL $BASE_URL/check-0g.sh | sh"
