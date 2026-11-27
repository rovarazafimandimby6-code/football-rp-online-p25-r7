-- Player-owned shop inventory and auditable purchases/resales.
CREATE TABLE IF NOT EXISTS p27_player_shop_purchases (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE CASCADE,
  purchase_id TEXT NOT NULL CHECK (length(purchase_id) BETWEEN 1 AND 64),
  item_id TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('standard','rare','premium')),
  equip_slot TEXT,
  base_price INTEGER NOT NULL CHECK (base_price > 0),
  paid_price INTEGER NOT NULL CHECK (paid_price > 0 AND paid_price <= base_price),
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 0 AND 50),
  currency TEXT NOT NULL CHECK (currency = 'player-coins'),
  status TEXT NOT NULL CHECK (status IN ('completed')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (account_id, purchase_id)
);

CREATE TABLE IF NOT EXISTS p27_player_shop_inventory (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE CASCADE,
  purchase_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('standard','rare','premium')),
  equip_slot TEXT,
  paid_price INTEGER NOT NULL CHECK (paid_price > 0),
  currency TEXT NOT NULL CHECK (currency = 'player-coins'),
  resellable INTEGER NOT NULL CHECK (resellable IN (0,1)),
  resale_rate REAL NOT NULL CHECK (resale_rate BETWEEN 0 AND 1),
  equipped INTEGER NOT NULL DEFAULT 0 CHECK (equipped IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('owned','resold')),
  purchased_at INTEGER NOT NULL CHECK (purchased_at >= 0),
  resold_at INTEGER,
  resale_id TEXT,
  PRIMARY KEY (account_id, purchase_id),
  FOREIGN KEY (account_id, purchase_id) REFERENCES p27_player_shop_purchases(account_id, purchase_id) ON DELETE CASCADE,
  CHECK ((status = 'owned' AND resold_at IS NULL AND resale_id IS NULL) OR
         (status = 'resold' AND equipped = 0 AND resold_at IS NOT NULL AND resale_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS p27_player_shop_one_owned_item
  ON p27_player_shop_inventory(account_id, item_id) WHERE status = 'owned';
CREATE UNIQUE INDEX IF NOT EXISTS p27_player_shop_one_equipped_slot
  ON p27_player_shop_inventory(account_id, equip_slot)
  WHERE status = 'owned' AND equipped = 1 AND equip_slot IS NOT NULL;

CREATE TABLE IF NOT EXISTS p27_player_shop_resales (
  account_id TEXT NOT NULL REFERENCES p27_accounts(id) ON DELETE CASCADE,
  resale_id TEXT NOT NULL CHECK (length(resale_id) BETWEEN 1 AND 64),
  purchase_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency = 'player-coins'),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (account_id, resale_id),
  FOREIGN KEY (account_id, purchase_id) REFERENCES p27_player_shop_purchases(account_id, purchase_id)
);
CREATE INDEX IF NOT EXISTS p27_player_shop_inventory_by_account
  ON p27_player_shop_inventory(account_id, status, purchased_at DESC);
