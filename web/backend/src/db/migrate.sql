CREATE TABLE IF NOT EXISTS users (
  uid          CHAR(36)        NOT NULL COMMENT 'UUID',
  login_type   VARCHAR(32)     NOT NULL COMMENT 'e.g. google',
  login_id     VARCHAR(255)    NOT NULL COMMENT 'provider user id',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (uid),
  UNIQUE KEY uq_login (login_type, login_id)
);

CREATE TABLE IF NOT EXISTS clawpaw_secrets (
  uid        CHAR(36)     NOT NULL COMMENT 'references users.uid',
  secret     VARCHAR(64)  NOT NULL COMMENT 'clawpaw secret token',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (uid)
);

-- SSH reverse tunnel credentials.
-- All users share the Linux user 'cp_shared' on the tunnel node.
-- Each user gets a unique adb_port in [10000, 19999] for their reverse tunnel.
-- password is used by the Android app to authenticate to the SSH server.
CREATE TABLE IF NOT EXISTS ssh_credentials (
  uid            CHAR(36)     NOT NULL COMMENT 'references users.uid',
  linux_user     VARCHAR(32)  NOT NULL DEFAULT 'cp_shared',
  linux_password VARCHAR(64)  NOT NULL COMMENT 'SSH password for cp_shared (shared secret)',
  adb_port       INT          NOT NULL COMMENT 'unique port in [10000, 19999]',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (uid),
  UNIQUE KEY uq_adb_port (adb_port)
);
