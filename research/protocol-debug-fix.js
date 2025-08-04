// server/routes/protocol.js の481行目付近を以下のように修正

// 修正前（問題のある部分）
fastify.log.info(`🔍 requestsList check for ${id}:`, {
  found: !!requestData,
  requestsListSize: requestsList.size,
  requestsListKeys: Array.from(requestsList.keys())
});

// 修正後（デバッグ強化版）
console.log('🚨 DEBUG: requestData type:', typeof requestData);
console.log('🚨 DEBUG: requestData keys:', requestData ? Object.keys(requestData) : 'NO DATA');
console.log('🚨 DEBUG: requestData.amount_mode:', requestData?.amount_mode);
console.log('🚨 DEBUG: Full requestData:', JSON.stringify(requestData, null, 2));

fastify.log.info(`🔍 requestsList check for ${id}:`, {
  found: !!requestData,
  requestsListSize: requestsList.size,
  requestsListKeys: Array.from(requestsList.keys()),
  dataType: typeof requestData,
  hasData: !!requestData
});

// レスポンス部分も修正
/*
return {
  request: requestData || {}  // 元のコード
};
*/

// これを以下に変更
/* 
console.log('🚨 RESPONSE DEBUG: About to return:', JSON.stringify(requestData, null, 2));
return {
  request: requestData
};
*/