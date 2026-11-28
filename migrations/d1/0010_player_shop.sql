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

-- Keep purchase and resale journals immutable and bind inventory rows to their source purchase.
CREATE TRIGGER IF NOT EXISTS p27_player_shop_inventory_purchase_match
BEFORE INSERT ON p27_player_shop_inventory
WHEN NOT EXISTS (
  SELECT 1 FROM p27_player_shop_purchases p
  WHERE p.account_id = NEW.account_id
    AND p.purchase_id = NEW.purchase_id
    AND p.item_id = NEW.item_id
    AND p.category = NEW.category
    AND p.rarity = NEW.rarity
    AND p.equip_slot IS NEW.equip_slot
    AND p.paid_price = NEW.paid_price
    AND p.currency = NEW.currency
)
BEGIN
  SELECT RAISE(ABORT, 'SHOP_PURCHASE_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS p27_player_shop_purchase_immutable_update
BEFORE UPDATE ON p27_player_shop_purchases
BEGIN
  SELECT RAISE(ABORT, 'SHOP_PURCHASE_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS p27_player_shop_purchase_immutable_delete
BEFORE DELETE ON p27_player_shop_purchases
BEGIN
  SELECT RAISE(ABORT, 'SHOP_PURCHASE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS p27_player_shop_inventory_identity_immutable
BEFORE UPDATE OF account_id, purchase_id, item_id, category, rarity, equip_slot,
  paid_price, currency, resellable, resale_rate, purchased_at
ON p27_player_shop_inventory
BEGIN
  SELECT RAISE(ABORT, 'SHOP_INVENTORY_IDENTITY_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS p27_player_shop_inventory_no_resurrection
BEFORE UPDATE OF status ON p27_player_shop_inventory
WHEN OLD.status = 'resold' AND NEW.status <> 'resold'
BEGIN
  SELECT RAISE(ABORT, 'SHOP_INVENTORY_RESOLD');
END;
CREATE TRIGGER IF NOT EXISTS p27_player_shop_inventory_no_delete
BEFORE DELETE ON p27_player_shop_inventory
BEGIN
  SELECT RAISE(ABORT, 'SHOP_INVENTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS p27_player_shop_resale_match
BEFORE INSERT ON p27_player_shop_resales
WHEN NOT EXISTS (
  SELECT 1 FROM p27_player_shop_inventory i
  WHERE i.account_id = NEW.account_id
    AND i.purchase_id = NEW.purchase_id
    AND i.item_id = NEW.item_id
    AND i.status = 'resold'
    AND i.resale_id = NEW.resale_id
    AND i.resold_at = NEW.created_at
    AND i.currency = NEW.currency
    AND NEW.amount = CAST(i.paid_price * i.resale_rate AS INTEGER)
)
BEGIN
  SELECT RAISE(ABORT, 'SHOP_RESALE_MISMATCH');
END;
CREATE TRIGGER IF NOT EXISTS p27_player_shop_resale_immutable_update
BEFORE UPDATE ON p27_player_shop_resales
BEGIN
  SELECT RAISE(ABORT, 'SHOP_RESALE_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS p27_player_shop_resale_immutable_delete
BEFORE DELETE ON p27_player_shop_resales
BEGIN
  SELECT RAISE(ABORT, 'SHOP_RESALE_IMMUTABLE');
END;
