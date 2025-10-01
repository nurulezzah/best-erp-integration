


// function getFormattedDateTime() {
//   const now = new Date();

//   const year = now.getFullYear();
//   const month = String(now.getMonth() + 1).padStart(2, '0'); // months are 0-based
//   const day = String(now.getDate()).padStart(2, '0');

//   const hours = String(now.getHours()).padStart(2, '0');
//   const minutes = String(now.getMinutes()).padStart(2, '0');
//   const seconds = String(now.getSeconds()).padStart(2, '0');

//   return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
// }

// //req to Best ERP
// const outputData = {
//     shop: "AFM-IT-API-TEST",
//     onlineOrderNumber: "20250904111913",
//     paymentMethod: "COD",
//     codPayAmount: 0,
//     currency: "MYR",  // <-- put string in quotes
//     buyerMessage: "testing order",
//     sellerRemarks: "for API test",
//     payTime: "2025-09-04T13:46:01",
//     buyer: {
//         buyerId: "zyheng",
//         receiverName: "Ezzah",
//         phone: "60133559879",  // <-- safer as string
//         email: "nurul.ezzah@altusmalaysia.com",
//         country: "MY",
//         province: "SELANGOR",
//         city: "PETALING JAYA",
//         postCode: "47800",
//         address1: "My House 01"
//     },
//     skuList: [
//         {
//             sku: "HENG-ITEM-1",
//             payAmount: 5.0,
//             paymentPrice: 15.0,
//             quantity: 3,
//             promotionDiscount: 0
//         }
//     ],
//     isSpecifyBatch: false
// };

// // input upstream
// inputData = {
//     // appId:100,
//     serviceType: "CREATE_SALES_ORDER",
//     shop:"AFM-IT-API-TEST",
//     onlineOrderNUmber: "20250904111913",
//     paymentMethod: "COD",
//     payTime: "2025-09-04T13:46:01",
//     skuList: {
//         sku: "HENG-ITEM-1",
//         payAmount: 5.0,
//         paymentPrice: 15.0,
//         quantity: 3
//     },
//     receiverName:"Ezzah",
//     receiverCountry:"MY",
//     receiverProvince:"SELANGOR",
//     receiverCity:"PETALING JAYA",
//     receiverPostcode:"47800",
//     receiverAddress:"My House 01",
//     timestamp:"2025-09-04T13:46:01"
// };

// // required fields
// const requiredFields = [
//   "appId",
//   "serviceType",
//   "shop",
//   "onlineOrderNUmber",
//   "paymentMethod",
//   "payTime",
//   "skuList",
//   "receiverName",
//   "receiverCountry",
//   "receiverProvince",
//   "receiverCity",
//   "receiverPostcode",
//   "receiverAddress",
//   "timestamp"
// ];

// // required fields inside skuList
// const requiredSkuFields = [
//   "sku",
//   "payAmount",
//   "paymentPrice",
//   "quantity"
// ];

// function validateInput(data) {
//   const missing = [];

//   // check top-level fields
//   requiredFields.forEach(field => {
//     if (!data.hasOwnProperty(field) || data[field] === undefined || data[field] === null) {
//       missing.push(field);
//     }
//   });

//   // check skuList fields
//   if (data.skuList && typeof data.skuList === "object") {
//     requiredSkuFields.forEach(field => {
//       if (!data.skuList.hasOwnProperty(field) || data.skuList[field] === undefined || data.skuList[field] === null) {
//         missing.push(`skuList.${field}`);
//       }
//     });
//   } else {
//     missing.push("skuList (must be an object)");
//   }

//   return missing;
// }

// const missingFields = validateInput(inputData);

// if (missingFields.length > 0) {
//     return returnResponse={
//         state : "Fail",
//         errorCode : 500,
//         timestamp : getFormattedDateTime()
//     };
//     console.log(returnResponse); //to print the response
// } else {
    
//   console.log("All required fields are present");
// }



