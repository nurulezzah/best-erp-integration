const pool = require('./db');
const crypto = require("crypto");
const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger'); // <-- import logger


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

  // Insert into DB (example)
  let query2 = `
    INSERT INTO so_upstream_input_formatted
      (rawuuid, appid, servicetype, shop, onlineordernumber, paymentmethod, codpayamount, paytime, sku, receivername, receiverphone, receivercountry, receiverprovince, receivercity, receiverpostcode, receiveraddress, trackingnumber)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10 ,$11, $12, $13, $14, $15, $16,$17)
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
    input.receiverAddress,
    input.trackingNumber
  ];

  const insertResult = await pool.query(query2, values2);

  const upstream_uuid = insertResult.rows[0].uuid;
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
          upstream_uuid,
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

  // let getSkuList = result.rows;
  let getSkuList = result.rows
  .filter(row => row.upstream_formatted_uuid === upstream_uuid) // only keep matching rows
  .map(({ upstream_formatted_uuid, appid, created_date, onlineordernumber, ...rest }) => rest); // then remove unwanted keys
  const jsonValue = insertResult.rows[0];

  return await createReq(jsonValue, getSkuList);
}


async function createReq(data, skuList){
  try{

    const uuid = data.uuid;

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

  } catch (err) {
    logger.error(err);
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
    delete buyer.onlineOrderNumber;

    //bizParam
    let bizParam = {
      "shop" : data.shop,
      "onlineOrderNumber" : data.onlineordernumber,
      "paymentMethod" : data.paymentmethod,
      "codPayAmount" : data.codpayamount || 0.0,
      "currency" : "MYR",
      "payTime" : data.paytime,
      "trackingNumber" : data.trackingnumber,
      "buyer" : buyer,
      "skuList" : skuList,
    };

    let query4 = `
        INSERT INTO so_bizparam
          (shop, onlineordernumber, paymentmethod, codpayamount, currency, paytime, buyer, skulist, trackingnumber)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
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
      JSON.stringify(bizParam.skuList),
      bizParam.trackingNumber
    ];
    const r = await pool.query(query4, values4);

    let uuidBizParam = r.rows[0].uuid;


    // CONCATENATE THE BASE REQUEST
    let concatOrder =  "".concat("appId=", data.appid,"bizParam=", JSON.stringify(bizParam),"serviceType=", data.servicetype,"timestamp=", timestamp,appSecret);
    // let concatOrder2 =  "".concat("appId=", data.appid,"bizParam=", JSON.stringify(bizParam),"serviceType=", data.servicetype,"timestamp=",Date.now(),appSecret);

    //CREATE SIGN
    let sign = md5Hash(concatOrder);

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
    

    return await reqToERP(baseReq, uuid);

  } catch (err) {
    logger.error("Error in reqToERP:", err.message);
  }

}

async function reqToERP(data, uuid) {

  // prepare form-data
  const form = new FormData();
  form.append('appId', data.appId);
  form.append('serviceType', data.serviceType);
  form.append('sign', data.sign);
  form.append('bizParam', data.bizParam); // stringify JSON
  form.append('timestamp', data.timestamp);
  form.append('appSecret', data.appSecret);

  const safeLog = {
    appId: data.appId,
    serviceType: data.serviceType,
    sign: data.sign,
    bizParam: JSON.parse(data.bizParam),
    timestamp: data.timestamp,
    appSecret: data.appSecret
  };

  logger.info(`Request to BEST ERP: ${JSON.stringify(safeLog, null, 2)}`);



  try {

    // POST REQUEST TO BEST ERP
    const response = await axios.post(
      'https://www.qianyierp.com/api/v1/salesOrder', // replace with ERP URL
      form,
      { headers: form.getHeaders() }
    );


    logger.info(`Response from BEST ERP: ${JSON.stringify(response.data, null, 2)}`);

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

    if ('bizContent' in response.data && response.data.bizContent != null){
      let a = JSON.parse(response.data.bizContent);
      if (a["state"] == "success" ){ //  0 & 0
  
        const newData = toLowerCaseKeys(a["result"]);
  
        try{
  
          // INSERT INTO so_bizcontent_result
          await dynamicInsert(pool, 'so_bizcontent_result', {
            base_req_uuid: data.uuid,
            ...newData,
            buyer: JSON.stringify(newData.buyer ?? {}),
            skulist: JSON.stringify(newData.skulist ?? []),
            tag: JSON.stringify(newData.tag ?? {}),
            ordercustomfieldvaluevolist: JSON.stringify(newData.ordercustomfieldvaluevolist ?? []),
            subordernumberlist: JSON.stringify(newData.subordernumberlist ?? [])
          });
  
          const onlineordernumber = a.result.onlineOrderNumber;
  
          // INSERT INTO so_result_tag
          await dynamicInsert(pool, 'so_result_tag', {onlineordernumber, ...newData.tag});
  
  
          //  SKULIST CAN LOOP THRU TO INSERT
          const res = await pool.query(
            `SELECT column_name
              FROM information_schema.columns
              WHERE  table_name   = $1`,
            ['so_result_sku']
          );
  
          const skulist = toLowerCaseKeys(a.result.skuList);
  
          for (const skuItem of skulist) {
  
            // add onlineordernumber into the object
            skuItem.onlineordernumber = onlineordernumber;
  
            // 2a. Insert SKU row into so_result_sku
            const insertedSku = await dynamicInsert(pool, 'so_result_sku', skuItem);
  
            if (insertedSku) {
              const onlineordernumber = insertedSku.onlineordernumber;
  
              // 2b. Insert tag row(s) into so_result_skutag
              if (skuItem.tag) {
                const tagData = { onlineordernumber, ...skuItem.tag };
                await dynamicInsert(pool, 'so_result_skutag', tagData);
              }
            }
          }
  
        }catch (err) {
          logger.error('Error inserting into bizContent:', err.response ? err.response.data : err.message);
        }
  
  
        //create SMF RESPONSE
        const formatted_res = {
          "state" : "success",
          "responsecode" : "0",
          "response_date" : getCurrentDateTime()
        }
        const upstreamQue = `
          UPDATE so_upstream_input_formatted
          SET state = $1,
              responsecode = $2,
              response_date = $3
          WHERE uuid = $4
          RETURNING rawuuid;
        `;
  
        let upstreamVal = [
          formatted_res.state,
          formatted_res.responsecode,
          formatted_res.response_date,
          uuid
        ];
  
        let queryUuid = await pool.query(upstreamQue, upstreamVal);


        const rawUuid = queryUuid.rows[0].rawuuid;

        const rawRes = `
          UPDATE so_upstream_input_raw
          SET rawresponse = $1::jsonb,
              response_date = $2
          WHERE uuid = $3;
        `;
  
        let rawVal = [
          JSON.stringify(formatted_res),
          formatted_res.response_date,
          rawUuid
        ];
  
        await pool.query(rawRes, rawVal);
        return await formatted_res;


  
  
      } else if (a["state"] == "failure" ){  //0 & 1
        const resData = toLowerCaseKeys(a);

        await dynamicInsert(pool, 'so_bizcontent_result', {
          base_req_uuid: data.uuid,
          ...resData
        });

        const errorcode = (resData.errorcode).trim();

        let responseCode = "1"; // default value

        if (errorcode.startsWith('order.')) {
          responseCode = "2";
        } else if (errorcode.startsWith('SHOP_')) {
          responseCode = "3";
        } else if (errorcode.startsWith('ORDER_')) {
          responseCode = "4";
        }else if (errorcode.startsWith('SKU_')){
          responseCode = "5";
        }

        //create SMF RESPONSE
        const formatted_res = {
          "state" : "failure",
          "responsecode" : responseCode,
          "response_date" : getCurrentDateTime()
        }


        const upstreamQue = `
          UPDATE so_upstream_input_formatted
          SET state = $1,
              responsecode = $2,
              response_date = $3
          WHERE uuid = $4
          RETURNING rawuuid;
        `;
  
        let upstreamVal = [
          formatted_res.state,
          formatted_res.responsecode,
          formatted_res.response_date,
          uuid
        ];
  
        let queryUuid = await pool.query(upstreamQue, upstreamVal);


        const rawUuid = queryUuid.rows[0].rawuuid;

        const rawRes = `
          UPDATE so_upstream_input_raw
          SET rawresponse = $1::jsonb,
              response_date = $2
          WHERE uuid = $3;
        `;
  
        let rawVal = [
          JSON.stringify(formatted_res),
          formatted_res.response_date,
          rawUuid
        ];
  
        await pool.query(rawRes, rawVal);

        return await formatted_res;
        
      };
    } else {

      //create SMF RESPONSE
      const formatted_res = {
        "state" : "failure",
        "responsecode" : "1",
        "response_date" : getCurrentDateTime()
      }


      const upstreamQue = `
        UPDATE so_upstream_input_formatted
        SET state = $1,
            responsecode = $2,
            response_date = $3
        WHERE uuid = $4
        RETURNING rawuuid;
      `;

      let upstreamVal = [
        formatted_res.state,
        formatted_res.responsecode,
        formatted_res.response_date,
        uuid
      ];

        let queryUuid = await pool.query(upstreamQue, upstreamVal);


      const rawUuid = queryUuid.rows[0].rawuuid;

      const rawRes = `
        UPDATE so_upstream_input_raw
        SET rawresponse = $1::jsonb,
            response_date = $2
        WHERE uuid = $3;
      `;

      let rawVal = [
        JSON.stringify(formatted_res),
        formatted_res.response_date,
        rawUuid
      ];

      await pool.query(rawRes, rawVal);
      return await formatted_res;

    }
  } catch (err) {
    logger.error('Error sending request to ERP:', err.response ? err.response.data : err.message);
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


// cache table columns so you don’t query information_schema every time
const tableColumnsCache = {};

async function getTableColumns(pool, tableName) {
  if (!tableColumnsCache[tableName]) {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tableName]
    );
    tableColumnsCache[tableName] = res.rows.map(r => r.column_name);
  }
  return tableColumnsCache[tableName];
}

async function dynamicInsert(pool, tableName, data) {
  const columns = await getTableColumns(pool, tableName);

  // filter keys that exist in the table
  const filtered = Object.keys(data)
    .filter(key => columns.includes(key))
    .reduce((obj, key) => {
      obj[key] = data[key];
      return obj;
    }, {});

  if (Object.keys(filtered).length === 0) {
    logger.info(`No matching columns for ${tableName}, skipping`);
    return null;
  }

  const fields = Object.keys(filtered).join(',');
  const placeholders = Object.keys(filtered)
    .map((_, i) => `$${i + 1}`)
    .join(',');

  const values = Object.values(filtered);

  const q = `INSERT INTO ${tableName} (${fields}) VALUES (${placeholders}) RETURNING *;`;
  const res = await pool.query(q, values);
  return res.rows[0]; // return full inserted row
}


module.exports = { processSalesOrder };
