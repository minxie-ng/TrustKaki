import { describe, expect, it } from 'vitest';
import { parseVoiceUpdate, parseVoiceCallback } from './voiceParser';
const message = {message_id: 2,date: 1700000000,from:{id:3,is_bot:false},chat:{id:3,type:'private'},voice:{file_id:'voice-file',duration:90,file_size:3000000}};
describe('voice parser',()=>{
 it('preserves oversized metadata for a helpful processing rejection',()=>expect(parseVoiceUpdate({update_id:1,message})).toMatchObject({updateId:'1',messageId:'2',senderUserId:'3',chatId:'3',duration:90,fileSize:3000000}));
 it.each([{...message,voice:{...message.voice,duration:0}},{...message,text:'mixed'},{...message,chat:{id:3,type:'group'}},{...message,from:{id:3,is_bot:true}},{...message,from:{id:Number.MAX_SAFE_INTEGER+1,is_bot:false}},{...message,date: Number.MAX_SAFE_INTEGER}])('rejects unsafe or mixed input',m=>expect(parseVoiceUpdate({update_id:1,message:m})).toBeNull());
 it('accepts human callback on a bot message',()=>expect(parseVoiceCallback({update_id:1,callback_query:{id:'cb',from:{id:3,is_bot:false},message:{...message,from:{id:4,is_bot:true}},data:'voice:confirm:123e4567-e89b-42d3-a456-426614174000'}})).toMatchObject({action:'confirm',senderUserId:'3',callbackId:'cb'}));
 it('rejects bad callback data',()=>expect(parseVoiceCallback({update_id:1,callback_query:{id:'cb',from:{id:3,is_bot:false},message,data:'voice:confirm:bad'}})).toBeNull());
});
