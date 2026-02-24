-- バーコードバスターズ用アイテムを1カラム（JSONB）で管理する
-- 既存データは無視し、フロントは barcode_busters_items のみ参照する

-- 1. 新カラム追加
ALTER TABLE "Member"
ADD COLUMN IF NOT EXISTS barcode_busters_items jsonb DEFAULT NULL;

-- 2. 旧カラム削除（不要になった場合にコメントを外して実行）
-- ALTER TABLE "Member" DROP COLUMN IF EXISTS item_card_count;
-- ALTER TABLE "Member" DROP COLUMN IF EXISTS kaishin_card_count;
-- ALTER TABLE "Member" DROP COLUMN IF EXISTS item_cards_valid_date;
