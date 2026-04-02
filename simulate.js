function simulatePlay(bulkType, itemsPerPage, leafletsPerPage, fromNumber, toNumber, loopLimit) {
  let currentNumber = fromNumber;
  const shouldLoopReceipts = bulkType === 'receipts' && itemsPerPage > 0;
  const shouldLoopCertificates = bulkType === 'certificates' && false; // csvData empty
  const csvData = [];
  let leafletsDrawn = 0;
  let csvRowIndex = 0;
  let pagesAdded = 0;

  do {
    // Create a new page
    if (leafletsDrawn % leafletsPerPage === 0) {
      pagesAdded++;
      for (let i = 0; i < leafletsPerPage; i++) {
        // Check if we should continue
        if (shouldLoopReceipts && currentNumber > toNumber) break;
        if (shouldLoopCertificates && csvRowIndex >= csvData.length) break;
        if (!shouldLoopReceipts && !shouldLoopCertificates && i > 0) break;
        
        // drawLeaflet()
        
        if (shouldLoopReceipts) {
          currentNumber += itemsPerPage;
        }
        if (shouldLoopCertificates) {
          csvRowIndex++;
        }
        
        leafletsDrawn++;
      }
    }
    
    // Break if we are done with numbers (receipts)
    if (shouldLoopReceipts && currentNumber > toNumber) break;
    // Break if we are done with CSV rows (certificates)
    if (shouldLoopCertificates && csvRowIndex >= csvData.length) break;
    // Break if not looping (single page)
    if (!shouldLoopReceipts && !shouldLoopCertificates) break;
    // Break if loop limit reached
    if (loopLimit && leafletsDrawn >= loopLimit * leafletsPerPage) break;
    
  } while ((shouldLoopReceipts && currentNumber <= toNumber) || (shouldLoopCertificates && csvRowIndex < csvData.length));

  console.log({
    pagesAdded,
    leafletsDrawn,
    finalNumber: currentNumber
  });
}

console.log("Sim1: 1 field, 1 per page, 1 to 50");
simulatePlay('receipts', 1, 1, 1, 50, null);

console.log("Sim2: 0 field, 1 per page, 1 to 50");
simulatePlay('receipts', 0, 1, 1, 50, null);

console.log("Sim3: 1 field, 6 per page, 1 to 50");
simulatePlay('receipts', 1, 6, 1, 50, null);

console.log("Sim4: 2 field, 1 per page, 1 to 50");
simulatePlay('receipts', 2, 1, 1, 50, null);
