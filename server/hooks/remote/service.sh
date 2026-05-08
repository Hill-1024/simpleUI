protocol="${SIMPLEUI_PROTOCOL:-hysteria2}"
action="${SIMPLEUI_SERVICE_ACTION:-restart}"
service="${SIMPLEUI_SERVICE:-}"
if [ -z "$service" ]; then
  service="hysteria-server.service"
  if [ "$protocol" = "trojan" ]; then
    service="trojan.service"
  elif [ "$protocol" != "hysteria2" ]; then
    simpleui_log "No systemd service is known for ${protocol}; register the monitor with a service name to control it."
    exit 51
  fi
fi

case "$action" in
  start|stop|restart)
    systemctl "$action" "$service"
    ;;
  *)
    simpleui_log "Unsupported service action: $action"
    exit 50
    ;;
esac

systemctl is-active "$service" || true
printf '__SIMPLEUI_RESULT__{"ok":true,"service":"%s","action":"%s"}\n' "$service" "$action"
