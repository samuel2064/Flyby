# Database Schema

## Tables

### `users`
- `id` UUID PRIMARY KEY
- `email` VARCHAR(255) UNIQUE
- `password_hash` VARCHAR(255)
- `display_name` VARCHAR(255)
- `is_premium` BOOLEAN DEFAULT false
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### `airports`
- `id` UUID PRIMARY KEY
- `code` VARCHAR(3) UNIQUE
- `name` VARCHAR(255)
- `city` VARCHAR(255)
- `state` VARCHAR(255)
- `country` VARCHAR(255)
- `timezone` VARCHAR(64)
- `latitude` REAL
- `longitude` REAL
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### `checkpoints`
- `id` UUID PRIMARY KEY
- `airport_id` UUID REFERENCES airports(id) ON DELETE CASCADE
- `code` VARCHAR(16)
- `name` VARCHAR(255)
- `terminal` VARCHAR(16)
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP
- UNIQUE (`airport_id`, `code`)

### `wait_times`
- `id` UUID PRIMARY KEY
- `checkpoint_id` UUID REFERENCES checkpoints(id) ON DELETE CASCADE
- `minutes` INT
- `source` VARCHAR(20) — crowd | pattern | official
- `report_type` VARCHAR(20) — standard | precheck | clear
- `reported_at` TIMESTAMP
- `user_id` UUID REFERENCES users(id) ON DELETE SET NULL
- `flag_count` INT DEFAULT 0 — denormalized abuse-flag count; reports with `flag_count >= 3` are excluded from all traveler-facing wait math
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP
- INDEX (`checkpoint_id`, `reported_at`)
- INDEX (`user_id`)

### `report_flags`
- `id` UUID PRIMARY KEY
- `report_id` UUID REFERENCES wait_times(id) ON DELETE CASCADE
- `reason` VARCHAR(20) — wrong_location | inaccurate | spam | other
- `note` VARCHAR(200) NULL
- `session_id` VARCHAR — flagger session (one flag per session per report)
- `created_at` TIMESTAMP
- UNIQUE (`report_id`, `session_id`)
- INDEX (`report_id`)

## Entity Relationships

```
User ──┐
       ├──< WaitTime >── Checkpoint >── Airport
       │        (user_id)   (checkpoint_id)  (airport_id)
```

- A **User** can submit many WaitTime reports
- A **Checkpoint** belongs to exactly one **Airport**
- An **Airport** can have many **Checkpoints**
- A **WaitTime** belongs to exactly one **Checkpoint** and optionally one **User**
- A **WaitTime** can have many **ReportFlag** rows (abuse reports, cascaded on delete)
