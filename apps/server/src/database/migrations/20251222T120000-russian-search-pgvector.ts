import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION pages_tsvector_trigger() RETURNS trigger AS $$
    begin
        new.tsv :=
                  setweight(to_tsvector('russian', f_unaccent(coalesce(new.title, ''))), 'A') ||
                  setweight(to_tsvector('russian', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'B');
        return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    UPDATE pages
    SET tsv =
      setweight(to_tsvector('russian', f_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('russian', f_unaccent(substring(coalesce(text_content, ''), 1, 1000000))), 'B');
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION pages_tsvector_trigger() RETURNS trigger AS $$
    begin
        new.tsv :=
                  setweight(to_tsvector('english', f_unaccent(coalesce(new.title, ''))), 'A') ||
                  setweight(to_tsvector('english', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'B');
        return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    UPDATE pages
    SET tsv =
      setweight(to_tsvector('english', f_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('english', f_unaccent(substring(coalesce(text_content, ''), 1, 1000000))), 'B');
  `.execute(db);

  await sql`DROP EXTENSION IF EXISTS vector`.execute(db);
}
