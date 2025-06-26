# scraptcha
(scrap)e ca(ptcha)

scrapes recaptcha and hcaptcha challenges using puppeteer

## how to reproduce

requires node, npm and vscode live server

serve html first then run following commands in your terminal

```bash
npm i
npm run recaptcha
npm run hcaptcha
```

images are saved in *_screenshots/

NOTICE: scraped hcaptcha images may be incomplete due to early screenshot
before rendering finishes, please delete those manually then
`npm run rename_hcaptcha` and `npm run hcaptcha`

this could be avoided by increasing the delay though
