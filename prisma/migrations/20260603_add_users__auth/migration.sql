-- Create users table
CREATE TABLE \"users\" (
  \"id\" TEXT NOT NULL PRIMARY KEY,
  \"email\" TEXT NOT NULL UNIQUE,
  \"password_hash\" TEXT NOT NULL,
  \"display_name\" TEXT,
  \"is_premium\" INTEGER NOT NULL DEFAULT 0,
  \"created_at\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \"updated_at\" DATETIME
);

-- Extend wait_times with user_id FK and make reported_at NOT NULL
ALTER TABLE \"wait_times\" ADD COLUMN \"user_id\" TEXT;
ALTER TABLE \"wait_times\" ADD CONSTRAINT fk_wait_time_user FOREIGN KEY (\"user_id\") REFERENCES \"users\" (\"id\") ON DELETE SET NULL;

-- Ensure reportedAt is NOT NULL by copying defaults if needed
UPDATE \"wait_times\" SET \"reported_at\" = CURRENT_TIMESTAMP WHERE \"reported_at\" IS NULL;

-- Re-do with NOT NULL constraint via new table method
PRAGMA legacy_alter_table=ON;
CREATE TABLE IF NOT EXISTS \"wait_times_new\" (
  \"id\" TEXT NOT NULL PRIMARY KEY,
  \"checkpoint_id\" TEXT NOT NULL,
  \"minutes\" INTEGER NOT NULL,
  \"source\" TEXT NOT NULL,
  \"report_type\" TEXT NOT NULL DEFAULT 'standard',
  \"reported_at\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \"user_id\" TEXT,
  \"created_at\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \"updated_at\" DATETIME,
  FOREIGN KEY (\"checkpoint_id\") REFERENCES \"checkpoints\"(\"id\") ON DELETE CASCADE,
  FOREIGN KEY (\"user_id\") REFERENCES \"users\"(\"id\") ON DELETE SET NULL
);
INSERT INTO \"wait_times_new\" (
  \"id\",\"checkpoint_id\",\"minutes\",\"source\",\"report_type\",\
  \"reported_at\",\"user_id\",\
  \"created_at\",\"updated_at\"
)
SELECT 
  \"id\",\"checkpoint_id\",\"minutes\",\"source\",\"report_type\" COALESCE(\"reported_at\", CURRENT_TIMESTAMP),
  \"user_id\",\"created_at\",\"updated_at\"
FROM \"wait_times\";
DROP TABLE \"wait_times\";
ALTER TABLE \"wait_times_new\" RENAME TO \"wait_times\";
PRAGMA legacy_alter_table=OFF;

CREATE INDEX IF NOT EXISTS \"wait_times_checkpoint_reported_idx\" ON \"wait_times\" (\"checkpoint_id\", \"reported_at\");
CREATE INDEX IF NOT EXISTS \"wait_times_user_idx\" ON \"wait_times\" (\"user_id\");
