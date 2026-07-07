# Write-Endpoint Outage Fallback Playbook

## 1. Manual Task Creation Workflow

When the write-endpoint API is down, engineers must create tasks through the Paperclip board directly:

1. Navigate to the Paperclip board UI
2. Use the **New Issue** form to create tasks manually
3. Fill in: Title, Description, Status (`todo`), Priority, Assignee
4. Add a comment linking to [TIR-86](/TIR/issues/TIR-86) referencing the incident
5. Note the issue identifier (e.g., `TIR-XXX`) for tracking

## 2. Temporary Read-Only Mode

- The read-endpoint continues to work — use `GET` operations as normal
- All `POST`/`PATCH`/`DELETE` operations against the write-endpoint will fail
- Cache issue data locally if you need to reference it during the outage
- Do not retry failed write operations without checking status first

## 3. Communication with Paperclip Support

- Report the outage to Paperclip support with:
  - Start time of the outage
  - Error messages received
  - Affected endpoints
- Monitor the status page for updates
- Post updates on [TIR-86](/TIR/issues/TIR-86)

## 4. Post-Outage Verification Steps

Once the write-endpoint is restored:

1. Confirm API responsiveness with a test ping
2. Sync any manually created tasks to the system
3. Verify all data integrity
4. Mark [TIR-86](/TIR/issues/TIR-86) as resolved
5. Remove temporary workarounds
