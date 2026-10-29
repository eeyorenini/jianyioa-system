/**
 * 阿里云短信（dysmsapi）—— 纯函数，只依赖 Node 内建 crypto / https
 *
 * 2026-10-29 从 server.js 抽出（渐进拆分第 8 轮）。
 * 两个函数都是「构造签名 → GET 请求 → 解析 JSON」的同一套逻辑，
 * 唯一区别是 Action（CreateSmsTemplate / SendSms）和参数集合，
 * 所以放在一起，改签名算法时只需改一处。
 *
 * 为什么必须抽成独立模块而不是塞进 api/sms.js：
 *   sendAliyunSms 在 server.js 里**还有两处块外调用**——
 *     1. server.js 的 sendSmsFromNotify（通知类短信，走模板发送）
 *     2. 短信验证码发送（业主端登录用的验证码短信）
 *   如果把它私有化到 api/sms.js，这两处会直接 ReferenceError。
 *   抽到 lib 后由调用方各自 require，依赖关系显式化。
 *
 * 注意：函数**不会抛业务错误**，阿里云的失败也走 resolve（返回 {Code,Message}），
 * 只有网络层/解析层失败才 reject。调用方必须自己判断 Code === 'OK'。
 */

const crypto = require('crypto');
const https = require('https');

// ==================== 阿里云添加模板 API ====================
function addAliyunSmsTemplate({ accessKeyId, accessKeySecret, signName, templateName, templateContent, templateRule, remark }) {
  return new Promise((resolve, reject) => {
    const domain = 'dysmsapi.aliyuncs.com';
    const version = '2017-05-25';
    const action = 'CreateSmsTemplate';

    const params = {
      Format: 'JSON',
      Version: version,
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: Math.random().toString(),
      Action: action,
      RelatedSignName: signName,
      TemplateType: '1',
      TemplateName: templateName,
      TemplateContent: templateContent,
      TemplateRule: templateRule, // JSON字符串，如 {"name":"name","project":"other_number2"}
      Remark: remark
    };

    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    // stringToSign：阿里云要求对 canonicalized 做双重编码
    const stringToSign = 'GET&%2F&' + encodeURIComponent(canonicalized);
    const signature = crypto.createHmac('sha1', accessKeySecret + '&').update(stringToSign).digest('base64');
    const queryString = canonicalized + '&Signature=' + encodeURIComponent(signature);

    // 解码展示实际发送的参数（调试用）
    const decodedParams = sortedKeys.map(k => k + '=' + decodeURIComponent(encodeURIComponent(params[k]))).join(' | ');
    console.log('【addAliyunSmsTemplate】实际发送参数:', decodedParams);
    console.log('【addAliyunSmsTemplate】完整QueryString:', queryString.slice(0, 200) + '...');

    const req = https.request({ hostname: domain, method: 'GET', path: '/?' + queryString }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error(data)); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

// ==================== 阿里云短信发送函数 ====================
function sendAliyunSms({ accessKeyId, accessKeySecret, signName, templateCode, phone, templateParam }) {
  return new Promise((resolve, reject) => {
    const domain = 'dysmsapi.aliyuncs.com';
    const version = '2017-05-25';
    const action = 'SendSms';

    const params = {
      Format: 'JSON',
      Version: version,
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: Math.random().toString(),
      Action: action,
      SignName: signName,
      TemplateCode: templateCode,
      PhoneNumbers: phone,
      TemplateParam: templateParam
    };

    // 构造待签名字符串（阿里云要求双重编码）
    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const stringToSign = 'GET&%2F&' + encodeURIComponent(canonicalized);
    const signature = crypto.createHmac('sha1', accessKeySecret + '&')
      .update(stringToSign).digest('base64');

    const queryString = canonicalized + '&Signature=' + encodeURIComponent(signature);
    const options = {
      hostname: domain,
      method: 'GET',
      path: '/?' + queryString
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

module.exports = { addAliyunSmsTemplate, sendAliyunSms };
