import { chromium } from '../apps/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:420,height:800}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto('http://127.0.0.1:19473');await page.getByTestId('voice-message-player').first().waitFor();
const players=page.getByTestId('voice-message-player'); if(await players.count()!==3)throw Error('player count');
await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.duration>0));
await players.nth(0).getByRole('button',{name:'Play voice message',exact:true}).click();await page.waitForTimeout(350);
let a=await page.locator('audio').nth(0).evaluate(a=>({time:a.currentTime,paused:a.paused,error:a.error?.code}));if(a.time<=0||a.paused||a.error)throw Error('first playback '+JSON.stringify(a));
await players.nth(1).getByRole('button',{name:'Play voice message',exact:true}).click();await page.waitForTimeout(250);
if(!await page.locator('audio').nth(0).evaluate(a=>a.paused))throw Error('exclusive playback');
await players.nth(1).getByRole('button',{name:'Set voice playback speed to 1.5 times',exact:true}).click();
if(await page.locator('audio').nth(1).evaluate(a=>a.playbackRate)!==1.5)throw Error('speed');
await players.nth(1).getByRole('slider').focus();await page.keyboard.press('ArrowRight');
if(await page.locator('audio').nth(1).evaluate(a=>a.currentTime)<4)throw Error('keyboard seek');
await players.nth(1).getByRole('button',{name:'Pause voice message',exact:true}).click();
if(!await players.nth(2).getByRole('button',{name:'Play voice message',exact:true}).isDisabled())throw Error('unavailable button');
await page.reload();await page.getByTestId('voice-message-player').first().waitFor();
if(await players.nth(0).getByRole('button',{name:'Set voice playback speed to 1.5 times',exact:true}).getAttribute('aria-pressed')!=='true')throw Error('speed persistence');
await page.screenshot({path:'.voice-qa/player.png'});if(errors.length)throw Error(errors.join('\n'));
console.log(JSON.stringify({playback:a,exclusive:true,speed:true,keyboardSeek:true,unavailable:true,reload:true,pageErrors:errors}));
} finally {await browser.close();}
