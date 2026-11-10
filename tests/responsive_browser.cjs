// Component layout checks; run after exporting the preview CSS with Odoo/libsass.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const preview = path.join(__dirname, 'responsive_preview');
const read = file => fs.readFileSync(file, 'utf8');
const source = read(path.join(root, 'static/src/js/face_attendance_bridge.js')).replace(/^import .*;\r?\n/gm, '');
const styles = '<link rel="stylesheet" href="/backend.css"><link rel="stylesheet" href="/current.css"><link rel="stylesheet" href="/responsive.css">';
const screen = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}
<style>html,body,#app{height:100%;margin:0}body{overflow:auto}</style><script src="/owl.js"></script></head><body><div id="app"></div>
<script>const {Component,onMounted,onPatched,onWillUnmount,useRef,useState,xml}=owl;
const useService=()=>({call:async()=>[],doAction:async()=>{}});
const loadJS=async()=>{};const registry={category:()=>({add:(_,C)=>window.Screen=C})};
${source}
(async()=>{window.screenInstance=await owl.mount(window.Screen,document.getElementById('app'));window.ready=true})()</script></body></html>`;
const publicForm = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ar_visitors/static/src/css/preregistration.css">${styles}</head><body><main class="prereg"><header><h1>Pré-enregistrement et consignes de sécurité</h1></header><section class="ar_public_safety"><p class="ar_public_safety_confirm">Confirmez que vous avez compris les consignes de sécurité.</p><form class="dialog-actions"><button>Je comprends les consignes</button><button>J'ai besoin d'une explication</button></form></section></main><dialog id="prereg-details-dialog"><h2>Identité du visiteur</h2><form><div class="fields">${['Prénom','Nom','CIN / passeport','Société','Téléphone','Nationalité'].map(t=>`<div><label>${t}</label><input value="Texte de démonstration pour vérifier le formulaire"></div>`).join('')}</div><div class="dialog-actions"><button>Annuler la saisie</button><button>Confirmer les informations et continuer</button></div></form></dialog><script>document.querySelector('dialog').showModal()</script></body></html>`;
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost').pathname;
    if (url === '/screen') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(screen); }
    if (url === '/public-form') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(publicForm); }
    let file;
    if (url === '/owl.js') file = path.resolve(root, '../../../addons/web/static/lib/owl/owl.js');
    else if (url.startsWith('/ar_visitors/static/')) file = path.join(root, url.slice('/ar_visitors/'.length));
    else file = path.join(preview, path.basename(url));
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    if (file.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        return res.end(read(file).replace('</head>', `${styles}</head>`));
    }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'image/svg+xml');
    res.end(fs.readFileSync(file));
});
const sizes = [[320,568],[360,640],[390,844],[600,960],[768,1024],[1024,600],[1280,720],[1366,768],[1920,1080],[844,390],[667,375]];
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser = await chromium.launch({channel:'msedge',headless:true});
    const failures = [], errors = [], results = [];
    try {
        const page = await browser.newPage();
        page.on('pageerror', e=>errors.push(e.message));
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const [width,height] of sizes) {
            await page.setViewportSize({width,height});
            for (const lang of ['fr','ar']) {
                await page.goto(base+'/screen');
                await page.waitForFunction(()=>window.ready);
                for (const state of ['home','hse','camera','consent','identity','safety']) {
                    await page.evaluate(({lang,state})=>{
                        const s=window.screenInstance.state;
                        Object.assign(s,{language:lang,hseIndex:state==='hse'?1:0,hsePaused:true,consentOpen:state==='consent',person:state==='identity'?{first_name:'Prénom de démonstration très long',last_name:'Nom de démonstration très long',nationality:'Maroc'}:false,safetyOpen:state==='safety',cameraRequested:state==='camera',camera:state==='camera'});
                        s.instructions=[{id:1,emoji:'🦺',text:'Restez accompagné par une personne autorisée et respectez les consignes de sécurité. '.repeat(4),images:[]}];
                    },{lang,state});
                    await page.waitForTimeout(40);
                    const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,screen:document.querySelector('.ar_face_screen').scrollWidth,client:document.querySelector('.ar_face_screen').clientWidth}));
                    if(metrics.scroll>width+2 || metrics.screen>metrics.client+2) failures.push({width,height,lang,state,metrics});
                    results.push({width,height,lang,state});
                }
            }
            for (const fixture of ['public-form','host-frame.html','feedback.html','intro.html','question-frame.html']) {
                await page.goto(base+'/'+fixture);
                const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
                if(scroll>width+2) failures.push({width,height,fixture,scroll});
                results.push({width,height,fixture});
            }
        }
        await page.setViewportSize({width:390,height:844});
        await page.goto(base+'/screen'); await page.waitForFunction(()=>window.ready);
        await page.waitForTimeout(1000);
        await page.screenshot({path:path.join(preview,'reception-mobile.png'),fullPage:true});
        fs.writeFileSync(path.join(preview,'results.json'),JSON.stringify({checks:results.length,failures,errors},null,2));
        console.log(JSON.stringify({checks:results.length,failures,errors},null,2));
        assert.deepEqual(errors,[]); assert.deepEqual(failures,[]);
    } finally {await browser.close(); server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
