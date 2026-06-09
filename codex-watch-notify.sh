#!/usr/bin/env bash
set -uo pipefail

readonly LOG_FILE="${OPENCODE_NOTIFY_LOG:-/tmp/opencode-watch-notify.log}"
readonly REMINDER_DELAY_SECONDS=0
readonly OPENCODE_DATA_DIR="${OPENCODE_DATA_DIR:-$HOME/.local/share/opencode}"
readonly IOS_SESSION_TITLE="${OPENCODE_IOS_SESSION_TITLE:-iOS Chat}"

is_ios_chat_session() {
  [[ "$source" != "opencode" ]] && return 1
  local session_id
  session_id=$(sed -n 's/^Session: //p' <<<"$payload")
  [[ -z "$session_id" ]] && return 1
  local session_title
  session_title=$(sqlite3 "$OPENCODE_DATA_DIR/opencode.db" "SELECT title FROM session WHERE id = '$session_id'" 2>/dev/null)
  [[ "$session_title" == "$IOS_SESSION_TITLE" ]]
}

log() {
  printf '%s source=%s event=%s %s\n' \
    "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
    "${source:-unknown}" \
    "${event:-unknown}" \
    "$*" >>"$LOG_FILE"
}

source="${1:-codex}"
event="${2:-unknown}"
payload="${3:-}"
requested_title="${4:-}"
caller_tty="${5:-}"

is_screen_off() {
  local brightness_val
  brightness_val=$(ioreg -l -w 0 2>/dev/null | sed -n 's/.*"brightness"={"min"=[0-9]*,"max"=[0-9]*,"value"=\([0-9]*\)}.*/\1/p' | head -1)
  if [[ -n "$brightness_val" && "$brightness_val" -eq 0 ]]; then
    return 0
  fi
  return 1
}

is_active_opencode_terminal() {
  [[ "$source" == "opencode" && -n "$caller_tty" ]] || return 1

  local front_asn front_info front_bundle selected_tty
  front_asn=$(/usr/bin/lsappinfo front 2>/dev/null) || return 1
  front_info=$(/usr/bin/lsappinfo info -only bundleID "$front_asn" 2>/dev/null) || return 1
  front_bundle=$(sed -n 's/^"CFBundleIdentifier"="\(.*\)"$/\1/p' <<<"$front_info")

  case "$front_bundle" in
    com.apple.Terminal)
      selected_tty=$(/usr/bin/osascript 2>/dev/null <<'APPLESCRIPT'
tell application "Terminal"
    if not running then return ""
    if (count of windows) is 0 then return ""
    return tty of selected tab of front window
end tell
APPLESCRIPT
      ) || return 1
      ;;
    *)
      return 1
      ;;
  esac

  [[ "$selected_tty" == "$caller_tty" ]]
}

case "$source" in
  codex)
    title="Codex: ${event}"
    list="Codex"
    original="/Users/mayifan/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
    if [[ -x "$original" ]]; then
      if ! "$original" "$event" "$payload" >/dev/null 2>&1; then
        log "native_notifier=failed"
      fi
    fi
    ;;
  opencode)
    title="${requested_title:-Opencode: 任务已完成}"
    list="opencode"
    ;;
  *)
    log "result=failed reason=unsupported_source"
    exit 2
    ;;
esac

if [[ "$event" == "task-completed" ]] && is_active_opencode_terminal; then
  if ! is_screen_off; then
    log "result=skipped reason=active_terminal tty=${caller_tty}"
    exit 0
  fi
  log "result=bypass_terminal_check reason=screen_off tty=${caller_tty}"
fi

if is_ios_chat_session; then
  log "result=skipped reason=ios_chat_session"
  exit 0
fi

# 提醒事项 → iCloud 同步 → Apple Watch 震动
if output=$(/usr/bin/osascript -e "
on run argv
    set t to item 1 of argv
    set l to item 2 of argv
    set p to item 3 of argv
    set delaySeconds to (item 4 of argv) as integer
    set notificationDate to (current date) + delaySeconds
    tell application \"Reminders\"
        tell list l
            make new reminder with properties {name:t, body:p, remind me date:notificationDate, due date:notificationDate}
        end tell
    end tell
end run
" "$title" "$list" "$payload" "$REMINDER_DELAY_SECONDS" 2>&1); then
  log "result=created list=${list} delay_seconds=${REMINDER_DELAY_SECONDS}"
else
  rc=$?
  log "result=failed rc=${rc} error=${output//$'\n'/ }"
  printf '%s\n' "$output" >&2
  exit "$rc"
fi
