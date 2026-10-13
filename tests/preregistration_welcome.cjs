const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('remote safety notice opens and Confirm closes it without submitting or reloading', () => {
    const events = {};
    const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
    const button = { addEventListener(name, fn) { events[name] = fn; } };
    const context = { document: {
        getElementById: id => ({ 'prereg-safety-notice-dialog': dialog, 'prereg-safety-notice-confirm': button })[id],
        querySelector: () => null,
    } };
    vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/src/js/preregistration.js'), 'utf8'), context);
    assert.equal(dialog.open, true);
    events.click();
    assert.equal(dialog.open, false);
});
function setup(denied=false) {
    const ids=['identity','video','photo','preview','consent','consent-dialog','details-dialog','error','camera','start','refuse','accept','close-details','retake','form-error'];
    const elements={}; let captures=0, stopped=0;
    for (const id of ids) elements[`prereg-${id}`]={value:'',open:false,events:{},dataset:{cameraError:'camera error',required:'required'},addEventListener(n,f){this.events[n]=f},showModal(){this.open=true},close(){this.open=false},removeAttribute(n){delete this[n]}};
    const get=id=>elements[`prereg-${id}`];
    const submit={disabled:false}; get('identity').querySelector=()=>submit;
    Object.assign(get('video'),{videoWidth:640,videoHeight:480,readyState:4,play:async()=>{}});
    const document={querySelector:()=>null,getElementById:id=>elements[id],createElement:()=>({getContext:()=>({drawImage(){captures++}}),toDataURL:()=> 'data:image/jpeg;base64,photo'})};
    const track={readyState:'live',stop(){stopped++;this.readyState='ended'}};
    const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
    const window={addEventListener(){}};
    vm.runInNewContext(fs.readFileSync('static/src/js/preregistration.js','utf8'),{document,window,navigator:{mediaDevices:{getUserMedia:async()=>{if(denied)throw Error();return stream}}}});
    return {get,submit,captures:()=>captures,stopped:()=>stopped};
}
test('preview does not capture; acceptance captures and opens identity; submit preserves camera until navigation',async()=>{
    const s=setup(); await new Promise(setImmediate);
    assert.equal(s.captures(),0);assert.equal(s.get('details-dialog').open,false);
    s.get('start').events.click();assert.equal(s.get('consent-dialog').open,true);
    await s.get('accept').events.click();
    assert.equal(s.captures(),1);assert.equal(s.get('photo').value,'photo');assert.equal(s.get('consent').value,'yes');assert.equal(s.get('details-dialog').open,true);
    s.get('identity').events.submit({preventDefault(){assert.fail('valid submission blocked')}});
    assert.equal(s.stopped(),0);assert.equal(s.submit.disabled,false);
});
test('refusal prevents capture and submission',async()=>{
    const s=setup();await new Promise(setImmediate);
    s.get('start').events.click();s.get('refuse').events.click();
    assert.equal(s.get('consent-dialog').open,false);assert.equal(s.captures(),0);
    let prevented=false;s.get('identity').events.submit({preventDefault(){prevented=true}});
    assert.equal(prevented,true);assert.equal(s.submit.disabled,false);
});
test('camera denial leaves identity closed and enables retry',async()=>{
    const s=setup(true);await new Promise(setImmediate);await s.get('accept').events.click();
    assert.equal(s.captures(),0);assert.equal(s.get('details-dialog').open,false);assert.equal(s.get('start').disabled,false);assert.equal(s.get('error').textContent,'camera error');
});
test('missing image asks to step back and allows another capture',async()=>{
    const s=setup();await new Promise(setImmediate);
    s.get('identity').dataset.captureError='Step back and retry';
    s.get('video').readyState=1;
    await s.get('accept').events.click();
    assert.equal(s.captures(),0);
    assert.equal(s.get('details-dialog').open,false);
    assert.equal(s.get('error').textContent,'Step back and retry');
    assert.equal(s.get('start').disabled,false);
    s.get('video').readyState=4;
    s.get('start').events.click();
    await s.get('accept').events.click();
    assert.equal(s.captures(),1);
    assert.equal(s.get('details-dialog').open,true);
});
