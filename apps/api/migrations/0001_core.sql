CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  invite_use_id TEXT REFERENCES invite_code_uses(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_devices_user ON devices(user_id, revoked_at);

CREATE TABLE invite_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE invite_code_uses (
  id TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_invite_code_uses_invite ON invite_code_uses(invite_id, created_at);

CREATE TABLE ledgers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_ledgers_owner_updated ON ledgers(owner_id, updated_at);

CREATE TABLE ledger_members (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (ledger_id, user_id)
);
CREATE INDEX idx_ledger_members_user ON ledger_members(user_id, removed_at);

CREATE TABLE ledger_invites (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  default_role TEXT NOT NULL CHECK (default_role IN ('editor', 'viewer')),
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_ledger_invites_ledger ON ledger_invites(ledger_id, created_at);

CREATE TABLE ledger_invite_uses (
  invite_id TEXT NOT NULL REFERENCES ledger_invites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (invite_id, user_id)
);
CREATE INDEX idx_ledger_invite_uses_invite ON ledger_invite_uses(invite_id, created_at);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'credit', 'payment', 'custom')),
  initial_balance_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_accounts_ledger_updated ON accounts(ledger_id, updated_at);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_categories_ledger_updated ON categories(ledger_id, updated_at);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_tags_ledger_name ON tags(ledger_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_tags_ledger_updated ON tags(ledger_id, updated_at);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer', 'refund', 'adjustment')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  account_id TEXT REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  transfer_account_id TEXT REFERENCES accounts(id),
  transfer_id TEXT,
  refund_of_id TEXT REFERENCES transactions(id),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  occurred_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_transactions_ledger_occurred ON transactions(ledger_id, occurred_at DESC, id DESC);
CREATE INDEX idx_transactions_ledger_updated ON transactions(ledger_id, updated_at);

CREATE TABLE account_entries (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_account_entries_ledger_account ON account_entries(ledger_id, account_id, created_at);

CREATE TABLE transaction_members (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (transaction_id, user_id)
);
CREATE INDEX idx_transaction_members_ledger ON transaction_members(ledger_id, user_id);

CREATE TABLE transaction_tags (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX idx_transaction_tags_ledger ON transaction_tags(ledger_id, tag_id);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id),
  month TEXT NOT NULL CHECK (length(month) = 7),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_budgets_ledger_month ON budgets(ledger_id, month, updated_at);

CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE sync_changes (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  version INTEGER NOT NULL CHECK (version > 0),
  changed_by TEXT NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (ledger_id, revision)
);
CREATE INDEX idx_sync_changes_ledger_revision ON sync_changes(ledger_id, revision);

CREATE TABLE operation_logs (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_operation_logs_ledger_created ON operation_logs(ledger_id, created_at DESC);
