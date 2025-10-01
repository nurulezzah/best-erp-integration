const pool = require('./db');
const crypto = require("crypto");
const axios = require('axios');
const FormData = require('form-data');


const appSecret = "9ced6df12e6ebcba54b2877677640165";
const timestamp = Date.now(); //miliseconds

// function to create MD5 hash
function md5Hash(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}


function getCurrentDateTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}


async function processSalesOrder(input) {
  let dbResult;
  //insert raw data into db
  const query = `
    INSERT INTO so_upstream_input_raw (rawdata)
    VALUES ($1::jsonb)
    RETURNING uuid;
  `;

  dbResult = await pool.query(query, [input]); // input is your JSON object


  const rawUuid = dbResult.rows[0].uuid;
  // console.log(input);
  const skuList =
    {
      sku: input.skuList?.sku || "",
      payAmount: input.skuList?.payAmount || 0.0,
      paymentPrice: input.skuList?.paymentPrice || 0.0,
      quantity: input.skuList?.quantity || 0,
      promotionDiscount: 0
    }
  ;
  // Insert into DB (example)
  let query2 = `
    INSERT INTO so_upstream_input_formatted
      (rawuuid, appid, servicetype, shop, onlineordernumber, paymentmethod, codpayamount, paytime, sku, receivername, receiverphone, receivercountry, receiverprovince, receivercity, receiverpostcode, receiveraddress)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10 ,$11, $12, $13, $14, $15, $16)
    RETURNING *;
  `;

  let values2 = [
    rawUuid,
    input.appId,
    input.serviceType,
    input.shop,
    input.onlineOrderNumber,
    input.paymentMethod,
    input.codPayAmount,
    input.payTime,
    JSON.stringify(input.skuList || []),
    input.receiverName,
    input.receiverPhone,
    input.receiverCountry,
    input.receiverProvince,
    input.receiverCity,
    input.receiverPostcode,
    input.receiverAddress
  ];

  const insertResult = await pool.query(query2, values2);

  //INPUT FORMMATED SKU
   if (Array.isArray(input.skuList)) {
    for (const sku of input.skuList) {
      await pool.query(
        `
        INSERT INTO so_upstream_input_formatted_sku
          (upstream_formatted_uuid, onlineordernumber, appid, sku, payamount, paymentprice, quantity)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
        `,
        [
          insertResult.rows[0].uuid,
          input.onlineOrderNumber,
          input.appId,
          sku.sku,
          sku.payAmount,
          sku.paymentPrice,
          sku.quantity
        ]
      );
    }
  }
  
  //need to retrieve the sku by order number
  const result = await pool.query(
    `SELECT * FROM so_upstream_input_formatted_sku WHERE onlineordernumber = $1`,
    [input.onlineOrderNumber]
  );

  let getSkuList = result.rows;
  const jsonValue = insertResult.rows[0];
  // console.log ("jsonValue =",getSkuList);

  return await createReq(jsonValue, getSkuList);
}


async function createReq(data, skuList){
  try{

    // console.log (data);
    // return;
    // INSERT INTO so_sku_list
    try {
    // prepare your insert statement once
    const so_sku_list = `
      INSERT INTO so_sku_list
        (onlineordernumber, sku, payamount, paymentprice, quantity)
      VALUES ($1, $2, $3, $4, $5);
    `;

    // loop through the array
    for (const skuItem of skuList) {
      // skip empty/invalid objects
      if (!skuItem.sku || !skuItem.onlineordernumber) continue;

      const valuesSku = [
        skuItem.onlineordernumber,
        skuItem.sku,
        parseFloat(skuItem.payamount),
        parseFloat(skuItem.paymentprice),
        skuItem.quantity
      ];

      await pool.query(so_sku_list, valuesSku);
    }

    console.log('All rows inserted');
  } catch (err) {
    console.error(err);
  }

    // INSERT into db 
    let buyer = {
      "onlineOrderNumber" : data.onlineordernumber,
      "receiverName" : data.receivername,
      "phone" : data.receiverphone,
      "country" : data.receivercountry,
      "province" : data.receiverprovince,
      "city" : data.receivercity,
      "district" : data.receiverdistrict || "",
      "postcode" : data.receiverpostcode,
      "address1" : data.receiveraddress
    }
    
    let query3 = `
        INSERT INTO so_buyer
          (onlineordernumber, receivername, phone, country, province, city, district, postcode, address1)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `;
    let values3 = [
      data.onlineordernumber,
      data.receivername,
      data.receiverphone,
      data.receivercountry,
      data.receiverprovince,
      data.receivercity,
      data.receiverdistrict,
      data.receiverpostcode,
      data.receiveraddress
    ];
  
    await pool.query(query3, values3);


    //bizParam
    let bizParam = {
      "shop" : data.shop,
      "onlineOrderNumber" : data.onlineordernumber,
      "paymentMethod" : data.paymentmethod,
      "codPayAmount" : data.codpayamount || 0.0,
      "currency" : "MYR",
      "payTime" : data.paytime,
      "buyer" : buyer,
      "skuList" : skuList,
    };

    let query4 = `
        INSERT INTO so_bizparam
          (shop, onlineordernumber, paymentmethod, codpayamount, currency, paytime, buyer, skuList)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
        RETURNING uuid;
      `;
    let values4 = [
      bizParam.shop,
      bizParam.onlineOrderNumber,
      bizParam.paymentMethod,
      bizParam.codPayAmount,
      bizParam.currency,
      bizParam.payTime,
      JSON.stringify(bizParam.buyer),
      JSON.stringify(bizParam.skuList)
    ];
    const r = await pool.query(query4, values4);

    let uuidBizParam = r.rows[0].uuid;


    // return bizParam;
    // CONCATENATE THE BASE REQUEST
    let concatOrder =  "".concat("appId=", data.appid,"bizParam=", JSON.stringify(bizParam),"serviceType=", data.servicetype,"timestamp=", timestamp,appSecret);
    // let concatOrder2 =  "".concat("appId=", data.appid,"bizParam=", JSON.stringify(bizParam),"serviceType=", data.servicetype,"timestamp=",Date.now(),appSecret);
    // console.log(concatOrder);
      
    //CREATE SIGN
    let sign = md5Hash(concatOrder);
    // console.log("sign= ",sign);

    const query5 = `
        INSERT INTO so_base_req
          (uuid_bizparam, appid, servicetype, bizparam, timestamp, sign)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        RETURNING *;
      `;

    let values5 = [
      uuidBizParam,
      data.appid,
      data.servicetype,
      bizParam,
      timestamp,
      sign
    ];

    const returnRes = await pool.query(query5, values5);

    // return;
        // INSERT INTO DB FOR BASE REQ
    let baseReq = {
      "uuid" : returnRes.rows[0].uuid,
      "uuid_bizparam" : returnRes.rows[0].uuid_bizparam,
      "appId" : returnRes.rows[0].appid,
      "serviceType" : returnRes.rows[0].servicetype,
      "sign" : returnRes.rows[0].sign,
      "bizParam" : returnRes.rows[0].bizparam,
      "timestamp" : returnRes.rows[0].timestamp,
      "appSecret" : appSecret
    };


    return await reqToERP(baseReq);

  } catch (err) {
    console.error("❌ Error in reqToERP:", err.message);
    console.error("Stack Trace:", err.stack);
  }

}

async function reqToERP(data) {

  // console.log("data = ", data);
  // return;
  // prepare form-data
  const form = new FormData();
  form.append('appId', data.appId);
  form.append('serviceType', data.serviceType);
  form.append('sign', data.sign);
  form.append('bizParam', data.bizParam); // stringify JSON
  form.append('timestamp', data.timestamp);
  form.append('appSecret', data.appSecret);

  try {
    // const response = await axios.post(
    //   'https://www.qianyierp.com/api/v1/salesOrder', // replace with ERP URL
    //   form,
    //   { headers: form.getHeaders() }
    // );
    
   


    //SUCCESS RESPONSE
    const response = {
      data : {
        state: 'success',
        errorCode: '',
        errorMsg: '',
        bizContent: '{"notSuccess":false,"result":{"buyer":{"address1":"My House 01","address2":"","buyerId":"","city":"PETALING JAYA","country":"MY","district":"","email":"","isDeleted":0,"phone":"0101010","postCode":"47800","province":"SELANGOR","receiverName":"Ezzah"},"buyerPaidShippingFee":0,"codPayAmount":666.0000,"createTime":1758789261000,"currency":"MYR","finalProductProtection":0,"forceSys":true,"freight":0.0000,"isAFN":0,"isDeleted":0,"isSys":false,"onlineOrderNumber":"4444","onlineStatus":"WAIT_AUDIT","orderNumber":"HE2509252712016","payTime":1756964761000,"paymentMethod":"COD","platform":"INDEPENDENT","platformRebate":0,"platformRebateForWook":0,"platformReturnToSeller":0,"returnGiftFlag":false,"returnSnList":false,"sellerDiscount":0,"sellerDiscountForWook":0,"shop":"AFM-IT-API-TEST","shopId":285633,"skuList":[{"discountPrice":0,"onlineItemId":"7960858","onlineProductCode":"HENG-ITEM-1","onlineProductTitle":"test item 1","onlineTransactionId":"5556666","orderSkuId":1928032245,"originalPrice":0,"payAmount":5.0000,"paymentPrice":0,"platformDiscount":0,"promotionDiscount":0.0000,"quantity":36,"shippingPrice":0.0000,"sku":"HENG-ITEM-1","subSkuList":[],"tag":{"allReturned":0,"hasRefund":0,"isGift":0,"onlineShipped":0,"preSale":0},"totalDiscount":0.0000,"totalTax":0.0000}],"status":"WAIT_AUDIT","tag":{"allRefund":0,"allReturned":0,"consolidated":0,"hasRefund":0,"itemReturned":0,"locked":0,"onlineShipFeedbackAlready":0,"onlineShipFeedbackFailed":0,"onlineShipped":0,"outOfStock":0,"partRefund":0,"partReturned":0,"platformFulfillment":0,"preSale":0,"reShip":0,"sampleOrder":0,"sendFailed":0,"sendWms":0,"split":0},"totalAmount":5.0000,"totalDiscount":0,"updateTime":1758789261000},"state":"success"}',
        requestId: '7e6a7a61-4f68-4513-8f49-3227761df2b2'
      }
    }


    // 
//     ERP response: {
//   state: 'success',
//   errorCode: '',
//   errorMsg: '',
//   bizContent: '{"errorCode":"order.id.exist","errorMsg":"订单号已存在","notSuccess":true,"state":"failure"}',
//   requestId: null
// }


    // 0 & 1
    // ERP response: {
    //   state: 'success',
    //   errorCode: '',
    //   errorMsg: '',
    //   bizContent: '{"errorCode":"SKU_NOT_EXISTS_WITH_ARGS","errorMsg":"sku不存在，具体清单如下: ITEM-1; ITEM-2; ","notSuccess":true,"state":"failure"}',
    //   requestId: '1957b4b8-f969-4236-b453-cb8dbc855feb'
    // }


//     ERP response: {
//   errorCode: 'APP_NOT_EXIST',
//   errorMsg: 'app不存在',
//   state: 'failure',
//   success: false
// }

// ERP response: {
//   state: 'failure',
//   errorCode: 'SYSTEM_ERROR',
//   errorMsg: '系统异常,请联系官方人员',
//   bizContent: null,
//   requestId: null
// }

    // return;
    const baseRes = `
       UPDATE so_base_req
       SET state = $1,
           errorcode = $2,
           errormsg = $3,
           bizcontent = $4::jsonb,
           response_date = $5
       WHERE uuid = $6;
     `;

   let baseResVal = [
     response.data.state,
     response.data.errorCode,
     response.data.errorMsg,
     response.data.bizContent,
     getCurrentDateTime(),
     data.uuid
   ];

   await pool.query(baseRes, baseResVal);

   let a = JSON.parse(response.data.bizContent);
   console.log(" array =", a["result"]);
   
   
   
   if (a["notSuccess"] == false){ //  0 & 0
    const newData = toLowerCaseKeys(a["result"]);
    console.log(" newData = ", newData);


    try{

      // INSERT INTO Sso_bizcontent_result

      const bizContent = `
        INSERT INTO so_bizcontent_result (
          ordernumber, base_req_uuid, parentordernumber, isoriginalorder,
          onlineordernumber, shop, warehouse, status, wmsstatus,
          currency, totalamount, freight, buyermessage, sellerremarks,
          carries, platform, updatetime, trackingnumber, paytime,
          shippingtime, createtime, buyer, estimatefulfillmentfee, totaldiscount,
          sellerdiscount, platformrebate, buyerpaidshippingfee, finalproductprotection, sellerdiscountforwook,
          platformrebateforwook, audittime, latestshipdate, skulist, tag,
          platformreturntoseller, isbusinessorder, salesrecordnumber, sitecode, isafn,
          platformshippingtime, paymentmethod, isdeleted, ordercustomfieldvaluevolist, subordernumberlist,
          onlinestatus, codpayamount
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22::jsonb,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33::jsonb,$34::jsonb,$35,$36,$37,$38,$39,$40,
          $41,$42,$43::jsonb,$44::jsonb,$45,$46
        )`;

      const bizValues = [
        newData.ordernumber,
        data.uuid,
        newData.parentordernumber,
        newData.isoriginalorder,
        newData.onlineordernumber,
        newData.shop,
        newData.warehouse,
        newData.status,
        newData.wmsstatus,
        newData.currency,
        newData.totalamount,
        newData.freight,
        newData.buyermessage,
        newData.sellerremarks,
        newData.carries,
        newData.platform,
        newData.updatetime,
        newData.trackingnumber,
        newData.paytime,
        newData.shippingtime,
        newData.createtime,
        JSON.stringify(newData.buyer, '{}'),                // $22
        newData.estimatefulfillmentfee,
        newData.totaldiscount,
        newData.sellerdiscount,
        newData.platformrebate,
        newData.buyerpaidshippingfee,
        newData.finalproductprotection,
        newData.sellerdiscountforwook,
        newData.platformrebateforwook,
        newData.audittime,
        newData.latestshipdate,
        JSON.stringify(newData.skulist, '[]'),              // $33
        JSON.stringify(newData.tag, '{}'),                  // $34
        newData.platformreturntoseller,
        newData.isbusinessorder,
        newData.salesrecordnumber,
        newData.sitecode,
        newData.isafn,
        newData.platformshippingtime,
        newData.paymentmethod,
        newData.isdeleted,
        JSON.stringify(newData.ordercustomfieldvaluevolist, '[]'), // $43
        JSON.stringify(newData.subordernumberlist, '[]'),          // $44
        newData.onlinestatus, 
        newData.codpayamount
        
      ];

      await pool.query(bizContent, bizValues);




      //  SKULIST CAN LOOP THRU TO INSERT

      


    }catch (err) {
      console.error('Error inserting into bizContent:', err.response ? err.response.data : err.message);
    }

    } else {  //0 & 1
      console.log("false");
      


    };

    // console.log('ERP response:', response.data);
  } catch (err) {
    console.error('Error sending request to ERP:', err.response ? err.response.data : err.message);
  }
}


function toLowerCaseKeys(obj) {
  if (Array.isArray(obj)) {
    // for arrays, map each element
    return obj.map(item => toLowerCaseKeys(item));
  } else if (obj !== null && typeof obj === 'object') {
    // for objects, reduce keys
    return Object.keys(obj).reduce((acc, key) => {
      acc[key.toLowerCase()] = toLowerCaseKeys(obj[key]);
      return acc;
    }, {});
  }
  // primitives: return as is
  return obj;
}


module.exports = { processSalesOrder };
