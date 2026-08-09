#!/usr/bin/env bash
# P1-07 Production external-monitor smoke (Owner notify + recovery).
# Never print CRON_SECRET / Authorization / bearer / ATLAS_APP_URL values.
set -euo pipefail

PROD_URL="${PROD_URL:-https://atlasapp.jp}"
PROD_URL="${PROD_URL%/}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "::error::GitHub Actions secret CRON_SECRET is missing."
  echo "::error::Set repository secret CRON_SECRET to the same value as Vercel Production CRON_SECRET."
  exit 1
fi

echo "CRON_SECRET_present=true"
if [ -n "${ATLAS_APP_URL:-}" ]; then
  echo "ATLAS_APP_URL_present=true"
else
  echo "ATLAS_APP_URL_present=false (PROD_URL hardcoded fallback in use)"
fi

EXPECTED_SHA_SHORT="$(printf '%s' "${GITHUB_SHA:-}" | cut -c1-7)"
echo "expected_commit_sha_short=${EXPECTED_SHA_SHORT}"

APP_CODE_CHANGED=0
if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  if git diff --name-only HEAD^ HEAD | grep -E '^(lib/|app/)' >/dev/null 2>&1; then
    APP_CODE_CHANGED=1
  fi
else
  APP_CODE_CHANGED=1
fi
echo "app_code_changed=${APP_CODE_CHANGED}"

echo "Waiting for Production deploy readiness (max ~6m)..."
DEPLOYED=""
PROD_SHA=""
for i in $(seq 1 24); do
  curl -sS -o /tmp/p107-probe.json "${PROD_URL}/api/health/external-monitor" || true
  PROD_SHA="$(
    python3 -c 'import json; d=json.load(open("/tmp/p107-probe.json")); print(d.get("commitShaShort") or "")' 2>/dev/null || true
  )"
  echo "probe=${i} production_commit_sha_short=${PROD_SHA}"
  if [ -n "${EXPECTED_SHA_SHORT}" ] && [ "${PROD_SHA}" = "${EXPECTED_SHA_SHORT}" ]; then
    DEPLOYED=1
    break
  fi
  # Workflow-only pushes do not create a new Vercel Production deploy.
  if [ "${APP_CODE_CHANGED}" = "0" ] && [ -n "${PROD_SHA}" ]; then
    READY="$(
      python3 -c 'import json; d=json.load(open("/tmp/p107-probe.json")); print("1" if d.get("durableReady") and d.get("tickWired") else "0")' 2>/dev/null || echo 0
    )"
    if [ "${READY}" = "1" ]; then
      echo "workflow_only_change=true smoking_live_production_sha=${PROD_SHA}"
      DEPLOYED=1
      break
    fi
  fi
  sleep 15
done

if [ -z "${DEPLOYED}" ]; then
  echo "::error::Production deploy not ready after wait (got ${PROD_SHA:-unknown}, expected ${EXPECTED_SHA_SHORT:-unknown}). Soft-success forbidden."
  exit 1
fi

echo "Calling Production external-monitor smoke (secret redacted)"
echo "URL=${PROD_URL}/api/health/external-monitor?force=1&smoke=1"

HTTP_CODE=$(curl -sS -o /tmp/p107-smoke.json -w "%{http_code}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "${PROD_URL}/api/health/external-monitor?force=1&smoke=1")

echo "http_status=${HTTP_CODE}"
BYTES=$(wc -c < /tmp/p107-smoke.json | tr -d ' ')
echo "body_bytes=${BYTES}"

case "${HTTP_CODE}" in
  2*) ;;
  *)
    echo "::error::Production smoke HTTP ${HTTP_CODE} (non-2xx). Soft-success forbidden."
    python3 -c 'import json; d=json.load(open("/tmp/p107-smoke.json")); ev=d.get("smokeEvidence") or {}; print({"ok": d.get("ok"), "smokeOk": d.get("smokeOk"), "error": d.get("error"), "commitShaShort": d.get("commitShaShort"), "smokeEvidence": {k: ev.get(k) for k in ["incidentId","deliveryStatus","recoveryDeliveryStatus","ownerNotifyPath","postClearTickStatus","incidentStatusAfterRecovery","tickReestablishHttpStatus","tickReestablishOk","tickReestablishErrorCode","localHeartbeatStamped","resolvedThisCycle","lineConfigured","detectedAt","recoveryAt"]}})'
    exit 1
    ;;
esac

python3 -c 'import json,sys; d=json.load(open("/tmp/p107-smoke.json")); ev=d.get("smokeEvidence") or {}; summary={"ok": d.get("ok"), "smokeOk": d.get("smokeOk"), "commitShaShort": d.get("commitShaShort"), "error": d.get("error"), "incidentId": ev.get("incidentId"), "deliveryStatus": ev.get("deliveryStatus"), "recoveryDeliveryStatus": ev.get("recoveryDeliveryStatus"), "ownerNotifyPath": ev.get("ownerNotifyPath"), "detectedAt": ev.get("detectedAt"), "recoveryAt": ev.get("recoveryAt"), "lineConfigured": ev.get("lineConfigured"), "tickReestablishHttpStatus": ev.get("tickReestablishHttpStatus"), "tickReestablishErrorCode": ev.get("tickReestablishErrorCode"), "localHeartbeatStamped": ev.get("localHeartbeatStamped")}; print(summary); failures=[]; failures += ["ok!=true"] if d.get("ok") is not True else []; failures += ["smokeOk!=true"] if d.get("smokeOk") is not True else []; failures += ["incidentId missing"] if not ev.get("incidentId") else []; failures += ["deliveryStatus!=sent"] if ev.get("deliveryStatus") != "sent" else []; failures += ["recoveryDeliveryStatus invalid"] if ev.get("recoveryDeliveryStatus") not in ("sent", "skipped") else []; failures += ["ownerNotifyPath not proven"] if ev.get("ownerNotifyPath") not in ("line", "system") else []; failures += ["detectedAt missing"] if not ev.get("detectedAt") else []; failures += ["recoveryAt missing"] if not ev.get("recoveryAt") else []; (print("::error::P1-07 Production smoke failed:", ", ".join(failures)), sys.exit(1)) if failures else print("p1_07_production_smoke=pass")'

# fresh-evidence re-trigger after resolved incident

# P1 FINAL AUDIT re-trigger 20260809T130856Z
