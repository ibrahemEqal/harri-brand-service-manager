import {test,expect} from '@playwright/test';
test('generate editable drafts without exporting until confirmed', async ({page}) => {
 let writes=0; page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/api/sso/groups')) writes++;});
 await page.goto('/'); await page.getByLabel('Brand ID').fill('18620833'); await page.getByRole('button',{name:'Load',exact:true}).click();
 await page.getByLabel('Number of groups').fill('4'); await page.getByRole('button',{name:'Generate groups',exact:true}).click();
 await expect(page.getByLabel('Group name')).toHaveCount(4); await page.getByLabel('Group name').first().fill('Edited group');
 expect(writes).toBe(0);
 page.once('dialog',d=>d.accept()); await page.getByRole('button',{name:'Confirm and export 4 groups'}).click();
 await expect(page.getByText('mock_success',{exact:true})).toHaveCount(4); expect(writes).toBe(4);
 await expect(page.getByText('Edited group',{exact:true})).toBeVisible();
});
