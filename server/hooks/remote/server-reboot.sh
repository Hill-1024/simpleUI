delay="${SIMPLEUI_REBOOT_DELAY:-8}"
case "$delay" in
  ''|*[!0-9]*) delay="8" ;;
esac
if [ "$delay" -lt 3 ]; then
  delay="3"
fi
if [ "$delay" -gt 300 ]; then
  delay="300"
fi

simpleui_log "Scheduling server reboot in ${delay} seconds"

schedule_method=""
if command -v systemctl >/dev/null 2>&1; then
  reboot_cmd="systemctl reboot"
elif command -v reboot >/dev/null 2>&1; then
  reboot_cmd="reboot"
else
  simpleui_log "No reboot command found"
  exit 127
fi

if command -v systemd-run >/dev/null 2>&1; then
  unit="simpleui-reboot-$(date +%s)"
  if systemd-run --unit="$unit" --on-active="${delay}s" /bin/sh -c "$reboot_cmd" >/dev/null 2>&1; then
    schedule_method="systemd-run"
  fi
fi

if [ -z "$schedule_method" ]; then
  nohup /bin/sh -c "sleep $delay; $reboot_cmd" >/dev/null 2>&1 &
  schedule_method="nohup"
fi

python3 - "$delay" "$schedule_method" <<'PY'
import json
import sys

delay, method = sys.argv[1:]
print("__SIMPLEUI_RESULT__" + json.dumps({
    "ok": True,
    "action": "server-reboot",
    "delaySeconds": int(delay),
    "method": method,
}, ensure_ascii=False))
PY
