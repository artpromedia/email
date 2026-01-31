-- Contacts Service Database Schema
-- Migration: 001_contacts.sql

-- Address Books (contact collections)
CREATE TABLE IF NOT EXISTS address_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sync_token VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_address_books_user ON address_books(user_id);
CREATE UNIQUE INDEX idx_address_books_default ON address_books(user_id, is_default) WHERE is_default = true;

-- Address book sharing
CREATE TABLE IF NOT EXISTS address_book_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(10) NOT NULL DEFAULT 'read',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(address_book_id, user_id)
);

CREATE INDEX idx_ab_shares_book ON address_book_shares(address_book_id);
CREATE INDEX idx_ab_shares_user ON address_book_shares(user_id);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
    uid VARCHAR(255) NOT NULL, -- vCard UID

    -- Name
    prefix VARCHAR(20),
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    suffix VARCHAR(20),
    nickname VARCHAR(100),
    display_name VARCHAR(255) NOT NULL,

    -- Organization
    company VARCHAR(200),
    department VARCHAR(200),
    job_title VARCHAR(200),

    -- Contact details (stored as JSONB)
    emails JSONB DEFAULT '[]',
    phones JSONB DEFAULT '[]',
    addresses JSONB DEFAULT '[]',
    urls JSONB DEFAULT '[]',
    ims JSONB DEFAULT '[]',

    -- Personal
    birthday DATE,
    anniversary DATE,
    notes TEXT,

    -- Photo
    photo_url TEXT,
    photo_data BYTEA,

    -- Categories
    categories TEXT[] DEFAULT '{}',

    -- Custom fields
    custom_fields JSONB DEFAULT '{}',

    -- Metadata
    starred BOOLEAN NOT NULL DEFAULT false,
    etag VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(address_book_id, uid)
);

CREATE INDEX idx_contacts_address_book ON contacts(address_book_id);
CREATE INDEX idx_contacts_uid ON contacts(uid);
CREATE INDEX idx_contacts_display_name ON contacts(display_name);
CREATE INDEX idx_contacts_starred ON contacts(starred) WHERE starred = true;
CREATE INDEX idx_contacts_emails ON contacts USING GIN(emails jsonb_path_ops);
CREATE INDEX idx_contacts_phones ON contacts USING GIN(phones jsonb_path_ops);
CREATE INDEX idx_contacts_search ON contacts USING GIN(
    to_tsvector('english',
        COALESCE(first_name, '') || ' ' ||
        COALESCE(last_name, '') || ' ' ||
        COALESCE(company, '') || ' ' ||
        COALESCE(nickname, '')
    )
);

-- Contact groups
CREATE TABLE IF NOT EXISTS contact_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_groups_book ON contact_groups(address_book_id);

-- Contact to group mapping
CREATE TABLE IF NOT EXISTS contact_group_members (
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contact_id, group_id)
);

CREATE INDEX idx_cgm_contact ON contact_group_members(contact_id);
CREATE INDEX idx_cgm_group ON contact_group_members(group_id);

-- Update sync_token on address book changes
CREATE OR REPLACE FUNCTION update_address_book_sync_token()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE address_books SET sync_token = gen_random_uuid()::text, updated_at = NOW()
    WHERE id = COALESCE(NEW.address_book_id, OLD.address_book_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sync_token_on_contact_change
AFTER INSERT OR UPDATE OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_address_book_sync_token();

-- Update etag on contact changes
CREATE OR REPLACE FUNCTION update_contact_etag()
RETURNS TRIGGER AS $$
BEGIN
    NEW.etag = gen_random_uuid()::text;
    NEW.updated_at = NOW();

    -- Generate display name if not set
    IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
        NEW.display_name = TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name));
        IF NEW.display_name = '' AND NEW.company IS NOT NULL THEN
            NEW.display_name = NEW.company;
        END IF;
        IF NEW.display_name = '' THEN
            NEW.display_name = 'No Name';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_etag_on_contact_update
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_contact_etag();

-- Auto-generate display name on insert
CREATE OR REPLACE FUNCTION generate_contact_display_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
        NEW.display_name = TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name));
        IF NEW.display_name = '' AND NEW.company IS NOT NULL THEN
            NEW.display_name = NEW.company;
        END IF;
        IF NEW.display_name = '' THEN
            NEW.display_name = 'No Name';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_display_name_on_insert
BEFORE INSERT ON contacts
FOR EACH ROW EXECUTE FUNCTION generate_contact_display_name();

-- Create default address book for new users
CREATE OR REPLACE FUNCTION create_default_address_book()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO address_books (user_id, name, is_default)
    VALUES (NEW.id, 'Contacts', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Uncomment to auto-create default address book for new users
-- CREATE TRIGGER create_user_address_book AFTER INSERT ON users
--     FOR EACH ROW EXECUTE FUNCTION create_default_address_book();
