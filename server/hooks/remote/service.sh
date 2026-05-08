protocol="${SIMPLEUI_PROTOCOL:-hysteria2}"
action="${SIMPLEUI_SERVICE_ACTION:-restart}"
service="hysteria-server.service"
if [ "$protocol" = "trojan" ]; then
  service="trojan.service"
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
