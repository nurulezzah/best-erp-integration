const pool = require('./db');
const crypto = require("crypto");
const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger'); // <-- import logger
// const { time } = require('console');


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


async function checkOrderStatus(input) {

    //insert raw data into db
    const query = `
        INSERT INTO inv_upstream_input_raw (rawdata, created_date)
        VALUES ($1::jsonb,$2)
        RETURNING uuid;
    `;
      let values =[
        input,
        getCurrentDateTime()
    ]

    let dbResult = await pool.query(query, values); 

    const rawUuid = dbResult.rows[0].uuid;


    const query2 = `
        INSERT INTO inv_upstream_input_formatted
        (rawuuid, appid, servicetype, sku, warehouse, created_date)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6)
        RETURNING *;
    `;

    const value2 = [
        rawUuid,
        input.appId,
        input.serviceType,
         JSON.stringify(input.sku),
        input.warehouse,
        getCurrentDateTime()
    ]
    let dbResult2 = await pool.query(query2, value2); 
    
    const formattedUuid = dbResult2.rows[0].uuid;
    const page = 1;
    const pageSize = 50;
    
    const query3 = `
        INSERT INTO inv_biz_param
        (skulist, warehouse, page, pagesize, created_date)
        VALUES ($1::json,$2,$3,$4,$5)
        RETURNING uuid;
    `;

    const value3 = [
        JSON.stringify(input.sku),
        input.warehouse,
        page,
        pageSize,
        getCurrentDateTime()
    ]
    let dbResult3 = await pool.query(query3, value3); 

    const bizParamUuid = dbResult3.rows[0].uuid;

    const bizParam = {
        "skuList" : input.sku,
        "warehouse" : input.warehouse,
        "page": page,
        "pageSize" : pageSize
    };


    let concatOrder =  "".concat("appId=", input.appId,"bizParam=", JSON.stringify(bizParam),"serviceType=", input.serviceType,"timestamp=", timestamp,appSecret);

    let sign = md5Hash(concatOrder);

    let baseReq = {
        "appId" : input.appId,
        "bizParam" : JSON.stringify(bizParam),
        "serviceType" : input.serviceType,
        "timestamp" : timestamp,
        "sign" : sign
    }

    const query4 = `
        INSERT INTO inv_base_req
        (uuid_upstream, uuid_bizparam, appid, bizparam, servicetype, timestamp, sign, created_date)
        VALUES ($1,$2,$3,$4::json,$5,$6,$7,$8)
        RETURNING uuid;
    `;

    const value4 = [
        formattedUuid,
        bizParamUuid,
        baseReq.appId,
        baseReq.bizParam,
        baseReq.serviceType,
        baseReq.timestamp,
        baseReq.sign,
        getCurrentDateTime()
    ];

    
    let dbResult4 = await pool.query(query4, value4);

    const baseReqUuid = dbResult4.rows[0].uuid;

    try {

        // prepare form-data
        const form = new FormData();
        form.append('appId', baseReq.appId);
        form.append('serviceType', baseReq.serviceType);
        form.append('sign', baseReq.sign);
        form.append('bizParam', baseReq.bizParam); // stringify JSON
        form.append('timestamp', baseReq.timestamp);
        form.append('appSecret', appSecret);

        const safeLog = {
            appId: baseReq.appId,
            serviceType: baseReq.serviceType,
            sign: baseReq.sign,
            bizParam: JSON.parse(baseReq.bizParam),
            timestamp: baseReq.timestamp,
            appSecret: appSecret
        };

        logger.info(`Request to BEST ERP: ${JSON.stringify(safeLog, null, 2)}`);

        // POST REQUEST TO BEST ERP
        const response = await axios.post(
        'https://www.qianyierp.com/api/v1/inventory', // replace with ERP URL
        form,
        { headers: form.getHeaders() }
        );


        logger.info(`Response from BEST ERP: ${JSON.stringify(response.data, null, 2)}`);

        if(response.data.state == "success") // (0 && 0) || ( 0 && 1)  
        {
            let baseRes = `
                UPDATE inv_base_req
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
                baseReqUuid
            ];

            await pool.query(baseRes, baseResVal);



            if (response?.data?.bizContent){

                const bizContentState = JSON.parse(response.data.bizContent);

                if(bizContentState.state == "success"){ // 0 && 0

                    const bizContentResult = toLowerCaseKeys(bizContentState.result[0]);
                    // console.log("bizContentResult =", bizContentResult);

                    await dynamicInsert(pool, 'inv_biz_content_result', {
                        base_req_uuid: baseReqUuid,
                        ...bizContentResult,
                        created_date: getCurrentDateTime()
                    });


                    //create SMF RESPONSE
                    const formatted_res = {
                    "state" : "success",
                    "responsecode" : "0",
                    "response_date" : getCurrentDateTime(),
                    "result" : bizContentResult
                    };
    
    
                    let resQuery = `
                        UPDATE inv_upstream_input_formatted
                        SET state = $1,
                            responsecode = $2,
                            response_date = $3
                        WHERE uuid = $4;
                        `;
    
                    let resVal = [
                        formatted_res.state,
                        formatted_res.responsecode,
                        formatted_res.response_date,
                        formattedUuid
                    ];
    
                    await pool.query(resQuery, resVal);
    
    
                    let rawResQuery = `
                        UPDATE inv_upstream_input_raw
                        SET rawresponse = $1,
                            response_date = $2
                        WHERE uuid = $3;
                        `;
    
                    let rawResVal = [
                        JSON.stringify(formatted_res),
                        formatted_res.response_date,
                        rawUuid
                    ];
    
                    await pool.query(rawResQuery, rawResVal);
    
                    return await formatted_res;

    
    
                }else{ // 0 && 1
    
                    //create SMF RESPONSE
                    const formatted_res = {
                    "state" : "failure",
                    "responsecode" : "1",
                    "response_date" : getCurrentDateTime()
                    };
    
    
                    let resQuery = `
                        UPDATE inv_upstream_input_formatted
                        SET state = $1,
                            responsecode = $2,
                            response_date = $3
                        WHERE uuid = $4;
                        `;
    
                    let resVal = [
                        formatted_res.state,
                        formatted_res.responsecode,
                        formatted_res.response_date,
                        formattedUuid
                    ];
    
                    await pool.query(resQuery, resVal);
    
    
                    let rawResQuery = `
                        UPDATE inv_upstream_input_raw
                        SET rawresponse = $1,
                            response_date = $2
                        WHERE uuid = $3;
                        `;
    
                    let rawResVal = [
                        JSON.stringify(formatted_res),
                        formatted_res.response_date,
                        rawUuid
                    ];
    
                    await pool.query(rawResQuery, rawResVal);
                    return await formatted_res;
    
                }
            }else{
                let baseRes = `
                    UPDATE inv_base_req
                    SET state = $1,
                        errorcode = $2,
                        errormsg = $3,
                        response_date = $4
                    WHERE uuid = $5;
                    `;

                let baseResVal = [
                    response.data.state,
                    response.data.errorCode,
                    response.data.errorMsg,
                    getCurrentDateTime(),
                    baseReqUuid
                ];

                await pool.query(baseRes, baseResVal);

                //create SMF RESPONSE
                const formatted_res = {
                "state" : "failure",
                "responsecode" : "1",
                "response_date" : getCurrentDateTime()
                };

                let resQuery = `
                    UPDATE inv_upstream_input_formatted
                    SET state = $1,
                        responsecode = $2,
                        response_date = $3
                    WHERE uuid = $4;
                    `;

                let resVal = [
                    formatted_res.state,
                    formatted_res.responsecode,
                    formatted_res.response_date,
                    formattedUuid
                ];

                await pool.query(resQuery, resVal);


                let rawResQuery = `
                    UPDATE inv_upstream_input_raw
                    SET rawresponse = $1,
                        response_date = $2
                    WHERE uuid = $3;
                    `;

                let rawResVal = [
                    JSON.stringify(formatted_res),
                    formatted_res.response_date,
                    rawUuid
                ];

                await pool.query(rawResQuery, rawResVal);
                return await formatted_res;
            }

        
        } else { //1 && 1

            let baseRes = `
                UPDATE inv_base_req
                SET state = $1,
                    errorcode = $2,
                    errormsg = $3,
                    response_date = $4
                WHERE uuid = $5;
                `;

            let baseResVal = [
                response.data.state,
                response.data.errorCode,
                response.data.errorMsg,
                getCurrentDateTime(),
                baseReqUuid
            ];

            await pool.query(baseRes, baseResVal);

            //create SMF RESPONSE
            const formatted_res = {
            "state" : "failure",
            "responsecode" : "1",
            "response_date" : getCurrentDateTime()
            };

            let resQuery = `
                UPDATE inv_upstream_input_formatted
                SET state = $1,
                    responsecode = $2,
                    response_date = $3
                WHERE uuid = $4;
                `;

            let resVal = [
                formatted_res.state,
                formatted_res.responsecode,
                formatted_res.response_date,
                formattedUuid
            ];

            await pool.query(resQuery, resVal);


            let rawResQuery = `
                UPDATE inv_upstream_input_raw
                SET rawresponse = $1,
                    response_date = $2
                WHERE uuid = $3;
                `;

            let rawResVal = [
                JSON.stringify(formatted_res),
                formatted_res.response_date,
                rawUuid
            ];

            await pool.query(rawResQuery, rawResVal);
            return await formatted_res;
        }


    }catch (err) {
        logger.error("Error in reqToERP:", err.message);

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


module.exports = { checkOrderStatus };
