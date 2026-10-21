import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
it('keeps existing seniors automatic and restricts stored language codes',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create table seniors(id int primary key);insert into seniors values(1);`);
 await db.exec(readFileSync('supabase/migrations/20261021042748_senior_voice_language.sql','utf8'));
 expect((await db.query<{preferred_voice_language:null}>('select preferred_voice_language from seniors')).rows[0].preferred_voice_language).toBeNull();
 await db.exec(`update seniors set preferred_voice_language='en'`);
 await expect(db.exec(`update seniors set preferred_voice_language='invalid'`)).rejects.toThrow();
 }finally{await db.close();}
});
