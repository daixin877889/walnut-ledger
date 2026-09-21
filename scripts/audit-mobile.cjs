// Browser UI smoke checks against an isolated HTTP fixture; never writes live data.
// Run after pnpm build. Install Chromium with: pnpm exec playwright install chromium --only-shell
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const output = process.env.AUDIT_OUTPUT || '/tmp/walnut-mobile-audit';
  const dist = path.resolve(__dirname, '../apps/mobile/dist');
  await mkdir(output, { recursive: true });
  const results = [];
  let browser, server;
  try {
    browser = await chromium.launch({ headless: true });
    server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://local').pathname;
        let file = path.resolve(dist, '.' + decodeURIComponent(pathname));
        if (!file.startsWith(dist + path.sep) && file !== dist) { response.writeHead(403).end(); return; }
        if (!path.extname(file)) file = path.join(dist, 'index.html');
        const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
        response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
        response.end(await readFile(file));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true });
    await context.addInitScript(() => {
      sessionStorage.setItem('walnut:session:access', 'isolated-test-token');
      sessionStorage.setItem('walnut:session:refresh', 'isolated-test-refresh');
    });
    const names = ['餐饮','购物','交通','居住','娱乐','医疗','学习','旅行','人情','宠物','通讯','水电','服饰','买菜','水果','美容','运动','报销','汽车','其他'];
    let categories = names.map((name,i)=>({id:'cat-'+i,name,kind:'expense',icon:['🍜','🛍️','🚕','🏠','🎮'][i%5],color:'#20a46d',sort_order:i,version:1}));
    let accounts = [{id:'cash',name:'现金账户',type:'cash',balance_cents:10000,version:1},{id:'bank',name:'储蓄卡',type:'bank',balance_cents:50000,version:1}];
    let transactions = [];
    const ledger = {id:'ledger',name:'家庭账本',role:'owner'};
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) { await route.continue(); return; }
      if (!url.pathname.startsWith('/api/v1/')) { await route.abort(); return; }
      const resource = url.pathname.slice('/api/v1'.length);
      const method = request.method(), body = request.postData() ? request.postDataJSON() : null;
      let data, status=200;
      if (resource==='/ledgers') data=[ledger];
      else if(resource.endsWith('/members'))data=[{user_id:'u',username:'测试用户',role:'owner'}];
      else if(resource==='/auth/devices')data=[{id:'d',name:'测试手机',current:true,last_seen_at:new Date().toISOString()}];
      else if(resource==='/ledgers/ledger/categories' && method==='GET')data=categories;
      else if(resource==='/ledgers/ledger/categories' && method==='POST'){data={...body,id:'new-cat',version:1,sort_order:categories.length};categories.push(data);status=201;}
      else if(resource.startsWith('/ledgers/ledger/categories/') && method==='PATCH'){const item=categories.find(item=>item.id===resource.split('/').at(-1));Object.assign(item,body,{version:item.version+1});data=item;}
      else if(resource.startsWith('/ledgers/ledger/categories/') && method==='DELETE'){categories=categories.filter(item=>item.id!==resource.split('/').at(-1));status=204;}
      else if(resource==='/ledgers/ledger/accounts')data=accounts;
      else if(resource==='/ledgers/ledger/transactions')data={items:transactions,next_cursor:null};
      else if(resource==='/transactions' && method==='POST'){
        data={...body,id:'tx-'+transactions.length,version:1,category_name:categories.find(item=>item.id===body.category_id)?.name,account_name:accounts.find(item=>item.id===body.account_id)?.name};
        transactions.unshift(data);status=201;
      } else { await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'FIXTURE_NOT_FOUND',data:null})});return; }
      await route.fulfill(status===204?{status:204}:{status,contentType:'application/json',body:JSON.stringify({code:'OK',data})});
    });
    const page = await context.newPage();
    const runtimeErrors=[];
    page.on('pageerror', error=>runtimeErrors.push(error.message));
    const go = async route => { await page.goto(origin+route);await page.locator('main').waitFor(); };
    const check = async (name, action) => {
      try { await action();results.push({name,passed:true}); }
      catch(error){results.push({name,passed:false,error:error.message});}
      console.log(JSON.stringify(results.at(-1)));
    };
    await check('all categories visible in the document and keypad saves evaluated money', async()=>{
      await go('/entry');await page.locator('[data-category]').nth(19).waitFor();
      assert.equal(await page.locator('[data-category]').count(),20);
      for(const key of ['1','0','＋','2'])await page.getByRole('button',{name:key,exact:true}).click();
      await page.locator('[data-edit="note"]').click();
      await page.getByRole('textbox',{name:'备注',exact:true}).fill('午饭');
      await page.getByRole('button',{name:'确定',exact:true}).click();
      await page.getByRole('button',{name:'保存并继续记一笔',exact:true}).click();
      await page.getByRole('status').waitFor();
      assert.equal(transactions[0].amount_cents,1200);assert.equal(transactions[0].note,'午饭');
    });
    await check('category create, rename and archive controls persist changes',async()=>{
      await go('/categories');
      await page.getByRole('button',{name:'新增分类',exact:true}).click();
      await page.locator('input[name="name"]').fill('测试分类');
      await page.getByRole('button',{name:'保存分类',exact:true}).click();
      const row=page.locator('[data-category-row]').filter({hasText:'测试分类'});
      await row.getByRole('button',{name:'编辑',exact:true}).click();
      await page.locator('input[name="name"]').fill('已改名');
      await page.getByRole('button',{name:'保存分类',exact:true}).click();
      await page.locator('[data-category-row]').filter({hasText:'已改名'}).getByRole('button',{name:'归档',exact:true}).click();
      await page.getByRole('button',{name:'确认归档',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});
      assert.equal(categories.some(item=>item.name==='已改名'),false);
    });
    for(const width of [390,320]){
      await page.setViewportSize({width,height:width===390?844:700});
      for(const route of ['/bills','/entry','/reports','/accounts','/me','/categories','/ledgers','/devices']){
        await check(route+' at '+width+'px has no horizontal overflow',async()=>{
          await go(route);
          await page.waitForLoadState('networkidle');
          assert.equal(await page.evaluate(()=>innerWidth),width);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          await page.screenshot({path:path.join(output,route.slice(1)+'-'+width+'.png'),fullPage:true});
        });
      }
    }
    await check('no unhandled browser errors',async()=>assert.deepEqual(runtimeErrors,[]));
    await writeFile(path.join(output,'results.json'),JSON.stringify({status:'executed',results},null,2));
    process.exitCode=results.some(item=>!item.passed)?1:0;
  } catch(error) {
    await writeFile(path.join(output,'results.json'),JSON.stringify({status:'blocked',error:error.message,results},null,2));
    console.error(error.message);process.exitCode=2;
  } finally {
    if(browser)await browser.close();
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
})();
