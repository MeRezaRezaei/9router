#!/usr/bin/env bash
set -e

echo "Checking .brain integrity..."

REQUIRED_FILES=(
  "CHANGELOG_AI.md" 
  "BACKLOG.md" 
  "BRAIN_MAP.md" 
  "ENTRYPOINT.md" 
  "SESSION_STATE.md"
  "PROJECT_CONTEXT.md"
  "RISK_REGISTER.md"
  "SELF_UPGRADE_PROTOCOL.md"
  "DECISION_LOG.md"
)

for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f ".brain/$f" ]; then
        echo "FAIL: Missing required file .brain/$f"
        exit 1
    fi
done

grep -q "Pain Factor" .brain/BACKLOG.md || { echo "FAIL: BACKLOG.md missing Pain Factor"; exit 1; }
grep -q "GOAL-001-01" .brain/BACKLOG.md || { echo "FAIL: BACKLOG.md missing GOAL-001-01 reference"; exit 1; }
grep -q "Variance" .brain/SESSION_STATE.md || { echo "FAIL: SESSION_STATE.md missing Variance"; exit 1; }
grep -q "Adjustment" .brain/SESSION_STATE.md || { echo "FAIL: SESSION_STATE.md missing Adjustment"; exit 1; }
grep -q "Actual" .brain/SESSION_STATE.md || { echo "FAIL: SESSION_STATE.md missing Actual"; exit 1; }
grep -q "Planned" .brain/SESSION_STATE.md || { echo "FAIL: SESSION_STATE.md missing Planned"; exit 1; }
grep -q "SYMPTOM" .brain/RISK_REGISTER.md || { echo "FAIL: RISK_REGISTER.md missing SYMPTOM"; exit 1; }
grep -q "EVIDENCE" .brain/RISK_REGISTER.md || { echo "FAIL: RISK_REGISTER.md missing EVIDENCE"; exit 1; }
grep -q "CAUSE" .brain/RISK_REGISTER.md || { echo "FAIL: RISK_REGISTER.md missing CAUSE"; exit 1; }
grep -q "RECOMMENDED FIX" .brain/RISK_REGISTER.md || { echo "FAIL: RISK_REGISTER.md missing RECOMMENDED FIX"; exit 1; }
grep -q "RISK" .brain/RISK_REGISTER.md || { echo "FAIL: RISK_REGISTER.md missing RISK"; exit 1; }
grep -q "ASK" .brain/RISK_REGISTER.md || { echo "FAIL: RISK_REGISTER.md missing ASK"; exit 1; }
grep -q "Memory Firewall Boundary" .brain/PROJECT_CONTEXT.md || { echo "FAIL: PROJECT_CONTEXT.md missing Memory Firewall Boundary"; exit 1; }

grep -q "Context" .brain/DECISION_LOG.md || { echo "FAIL: DECISION_LOG.md missing Context"; exit 1; }
grep -q "Decision" .brain/DECISION_LOG.md || { echo "FAIL: DECISION_LOG.md missing Decision"; exit 1; }
grep -q "Consequences" .brain/DECISION_LOG.md || { echo "FAIL: DECISION_LOG.md missing Consequences"; exit 1; }
echo "PASS: Required files present and constraints met."

echo "Checking BRAIN_MAP.md references..."
grep -o '[A-Z_]*\.md' .brain/BRAIN_MAP.md | sort | uniq | while read -r file; do
    if [ ! -f ".brain/$file" ]; then
        echo "FAIL: BRAIN_MAP.md references missing file: $file"
        exit 1
    fi
done
echo "PASS: All BRAIN_MAP.md references exist."
