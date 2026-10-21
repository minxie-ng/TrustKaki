import {act,createElement} from 'react';
import type {Root} from 'react-dom/client';
// @ts-expect-error jsdom intentionally ships without TypeScript declarations.
import {JSDOM} from 'jsdom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {VoiceLanguagePanel} from './VoiceLanguagePanel';
let dom:JSDOM,root:Root,container:HTMLDivElement;
const fetcher=vi.fn();
beforeEach(async()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>');
 vi.stubGlobal('window',dom.window);vi.stubGlobal('document',dom.window.document);vi.stubGlobal('navigator',dom.window.navigator);
 vi.stubGlobal('fetch',fetcher);fetcher.mockReset();
 (globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 container=document.createElement('div');document.body.append(container);
 root=(await import('react-dom/client')).createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());dom.window.close();vi.unstubAllGlobals();});
async function render(){await act(async()=>root.render(createElement(VoiceLanguagePanel,{seniorId:'senior',authToken:'token',onUnauthorized:vi.fn()})));}
it('loads preference, saves an explicit selection and confirms its scope',async()=>{
 fetcher.mockResolvedValueOnce(Response.json({language:null})).mockResolvedValueOnce(Response.json({language:'en'}));
 await render();const select=container.querySelector('select')!;const button=container.querySelector('button')!;
 expect(button.disabled).toBe(true);
 act(()=>{select.value='en';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 expect(button.disabled).toBe(false);
 await act(async()=>button.click());
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({language:'en'});
 expect(container.textContent).toContain('Applies to new voice notes');expect(button.disabled).toBe(true);
});
it('does not enable editing after a failed preference load',async()=>{
 fetcher.mockResolvedValue(new Response('',{status:503}));await render();
 expect(container.querySelector('select')!.disabled).toBe(true);expect(container.querySelector('button')!.disabled).toBe(true);
 expect(container.textContent).toContain('could not be loaded');
});
it('does not claim a failed save succeeded',async()=>{
 fetcher.mockResolvedValueOnce(Response.json({language:null})).mockResolvedValueOnce(new Response('',{status:503}));
 await render();const select=container.querySelector('select')!;
 act(()=>{select.value='zh';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 await act(async()=>container.querySelector('button')!.click());
 expect(container.textContent).toContain('was not saved');expect(container.textContent).not.toContain('Voice language saved');
});
