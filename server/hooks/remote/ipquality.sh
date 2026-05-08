#!/usr/bin/env bash

simpleui_ensure_tool() {
  local bin="$1"
  local pkg="${2:-$1}"
  if command -v "$bin" >/dev/null 2>&1; then
    return 0
  fi
  simpleui_log "Installing dependency: $pkg"
  simpleui_pkg_install "$pkg"
}

simpleui_download_ipquality() {
  local dir="/opt/simpleui-hook/upstream/ipquality"
  local script="$dir/ip.sh"
  install -d -m 700 "$dir"
  simpleui_ensure_tool curl curl
  simpleui_log "Downloading upstream IPQuality script"
  curl -fsSL "https://raw.githubusercontent.com/xykt/IPQuality/main/ip.sh" -o "$script"
  chmod 700 "$script"
  SIMPLEUI_IPQUALITY_SCRIPT="$script"
}

simpleui_ipquality_args() {
  local mode="${SIMPLEUI_IPQUALITY_MODE:-dual}"
  IPQUALITY_ARGS=(-y)
  if [ "${SIMPLEUI_IPQUALITY_PRIVACY:-1}" != "0" ]; then
    IPQUALITY_ARGS+=(-p)
  fi
  case "$mode" in
    dual|"") ;;
    ipv4) IPQUALITY_ARGS+=(-4) ;;
    ipv6) IPQUALITY_ARGS+=(-6) ;;
    *)
      simpleui_log "Unsupported IPQuality mode: $mode"
      exit 64
      ;;
  esac
  if [ -n "${SIMPLEUI_IPQUALITY_FULL_IP:-}" ] && [ "${SIMPLEUI_IPQUALITY_FULL_IP}" != "0" ]; then
    IPQUALITY_ARGS+=(-f)
  fi
  if [ -n "${SIMPLEUI_IPQUALITY_LANGUAGE:-}" ]; then
    IPQUALITY_ARGS+=(-l "$SIMPLEUI_IPQUALITY_LANGUAGE")
  fi
  if [ -n "${SIMPLEUI_IPQUALITY_INTERFACE:-}" ]; then
    IPQUALITY_ARGS+=(-i "$SIMPLEUI_IPQUALITY_INTERFACE")
  fi
  if [ -n "${SIMPLEUI_IPQUALITY_PROXY:-}" ]; then
    IPQUALITY_ARGS+=(-x "$SIMPLEUI_IPQUALITY_PROXY")
  fi
}

simpleui_text_report_ok() {
  local report="$1"
  local log_file="$2"
  [ -s "$report" ] || [ -s "$log_file" ]
}

simpleui_ipquality_result() {
  local code="$1"
  local upstream_code="$2"
  local mode="${SIMPLEUI_IPQUALITY_MODE:-dual}"
  local report="$3"
  local log_file="$4"
  local bytes=0
  if [ -s "$report" ]; then
    bytes="$(wc -c < "$report" | tr -d ' ')"
  fi
  python3 - "$code" "$upstream_code" "$mode" "$report" "$log_file" "$bytes" <<'PY'
import json
import re
import sys

code, upstream_code, mode, report, log_file, size = sys.argv[1:]
source = report if report and size != "0" else log_file
raw = ""
log_raw = ""
if source:
    try:
        with open(source, "r", encoding="utf-8", errors="ignore") as handle:
            raw = handle.read()
    except OSError:
        raw = ""
if log_file:
    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as handle:
            log_raw = handle.read()
    except OSError:
        log_raw = ""
match = re.search(r"https://Report\.Check\.Place/[^\s\x1b\"'<>]+", raw + "\n" + log_raw)
payload = {
    "ok": code == "0",
    "exitCode": int(code),
    "upstreamExitCode": int(upstream_code),
    "mode": mode,
    "reportPath": report,
    "logPath": log_file,
    "reportUrl": match.group(0) if match else None,
    "reportBytes": int(size or 0),
    "rawOutput": raw,
}
print("__SIMPLEUI_IPQUALITY__" + json.dumps(payload, ensure_ascii=False))
PY
}

simpleui_download_ipquality
simpleui_ipquality_args

out_dir="/etc/simpleui/ipquality"
install -d -m 700 "$out_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="$out_dir/report-${timestamp}.ansi"
log_file="$out_dir/run-${timestamp}.log"
IPQUALITY_ARGS+=(-o "$report")

simpleui_log "Running IPQuality original report output"
set +e
bash "$SIMPLEUI_IPQUALITY_SCRIPT" "${IPQUALITY_ARGS[@]}" >"$log_file" 2>&1
code=$?
set -e

simpleui_log "IPQuality exit code: $code"
simpleui_log "IPQuality report: $report"
simpleui_log "IPQuality log: $log_file"
if ! simpleui_text_report_ok "$report" "$log_file" && [ -s "$log_file" ]; then
  simpleui_log "Last IPQuality output lines:"
  tail -n 80 "$log_file" || true
fi

effective_code="$code"
if simpleui_text_report_ok "$report" "$log_file"; then
  effective_code=0
fi
simpleui_ipquality_result "$effective_code" "$code" "$report" "$log_file"
exit "$effective_code"
