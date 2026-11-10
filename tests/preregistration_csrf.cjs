const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(status=200) {
    let handler, submissions=0, reloads=0;
    const token={value:'stale'}, button={disabled:false}, error={textContent:''};
    const form={addEventListener(name,fn){handler=fn;},querySelector(){return token;},requestSubmit(b){assert.equal(b,button);submissions++;handler({submitter:b,defaultPrevented:false,preventDefault(){assert.fail('second submission blocked');}});}};
    const root={dataset:{csrfUrl:'/personal/csrf',sessionError:'Retry'},querySelectorAll(){return [form];}};
    const document={getElementById(id){return ['prereg-form-error','prereg-error'].includes(id)?error:null;},querySelector(){return root;}};
    vm.runInNewContext(fs.readFileSync('static/src/js/preregistration.js','utf8'),{document,window:{location:{reload(){reloads++;}}},fetch:async(url,opts)=>{assert.equal(url,'/personal/csrf');assert.equal(opts.credentials,'same-origin');return {status,ok:status===200,json:async()=>({csrf_token:'fresh'})};}});
    return {submit:()=>handler({submitter:button,defaultPrevented:false,preventDefault(){}}),token,button,error,submissions:()=>submissions,reloads:()=>reloads};
}
test('refreshes CSRF then submits once with original action button',async()=>{
    const s=setup();await s.submit();assert.equal(s.token.value,'fresh');assert.equal(s.submissions(),1);assert.equal(s.button.disabled,false);
});
test('lost invitation session reloads personal link without submitting stale form',async()=>{
    const s=setup(409);await s.submit();assert.equal(s.submissions(),0);assert.equal(s.reloads(),1);
});
test('refresh failure preserves form and enables retry',async()=>{
    const s=setup(500);await s.submit();assert.equal(s.submissions(),0);assert.equal(s.token.value,'stale');assert.equal(s.error.textContent,'Retry');assert.equal(s.button.disabled,false);
});
