import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { withInferenceBudget, inferenceSignal } from "./inferenceBudget";
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("shares the deadline across stages and aborts an active request",async()=>{
  vi.useFakeTimers();
  await withInferenceBudget(async()=>{
    const first=inferenceSignal(1000,true);
    await vi.advanceTimersByTimeAsync(40);
    const second=inferenceSignal(1000,true);
    await vi.advanceTimersByTimeAsync(10);
    expect(first.aborted).toBe(true);expect(second.aborted).toBe(true);
    expect(()=>inferenceSignal(1000,true)).toThrow("Inference budget exhausted");
  },{timeoutMs:50,maxCalls:3});
  expect(vi.getTimerCount()).toBe(0);
});
it("caps model calls across stages without affecting another request",async()=>{
  await withInferenceBudget(async()=>{
    inferenceSignal(1000,true);inferenceSignal(1000,true);
    expect(()=>inferenceSignal(1000,true)).toThrow("Inference budget exhausted");
  },{timeoutMs:100,maxCalls:2});
  await withInferenceBudget(async()=>{expect(inferenceSignal(1000,true).aborted).toBe(false);},{timeoutMs:100,maxCalls:2});
});
it("stops retries at the shared deadline and returns a safe fallback",async()=>{
  vi.useFakeTimers();vi.stubEnv("TRUSTKAKI_LLM_API_KEY","synthetic");
  const fetcher=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal("fetch",fetcher);
  const {runAgent}=await import("./runner");
  const pending=withInferenceBudget(()=>runAgent({agentId:"triage",agentName:"Triage",systemPrompt:"JSON",userPrompt:"hello",schema:z.object({safe:z.boolean()}),fallback:()=>({safe:true}),timeoutMs:1000}),{timeoutMs:50,maxCalls:5});
  await vi.advanceTimersByTimeAsync(50);
  const result=await pending;
  expect(result.fallback).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.errorMessage).toBe("budget_exhausted");
  expect(vi.getTimerCount()).toBe(0);
});
it("finishes the real orchestration with policy and traces after deadline without later model calls",async()=>{
  vi.useFakeTimers();vi.stubEnv("TRUSTKAKI_LLM_API_KEY","synthetic");
  const fetcher=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal("fetch",fetcher);
  const {orchestrate}=await import("./orchestrator");
  const pending=withInferenceBudget(()=>orchestrate("I prefer quiet one-to-one chats",{senior:{name:"Fictional senior",age:78,livingSituation:"alone",caregiver:"Fictional caregiver",aacVolunteer:"Fictional volunteer"},messages:[],currentRiskLevel:"red"}),{timeoutMs:50,maxCalls:12});
  await vi.advanceTimersByTimeAsync(50);
  const result=await pending;
  expect(result.policy.finalRisk).toBe("red");
  expect(result.contextMemoryCandidates).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.traces.some(trace=>trace.errorMessage==="budget_exhausted")).toBe(true);
});
