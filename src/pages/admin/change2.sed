/\/\/ Build WhatsApp message/,/message += `\\n\\nClosing Video: \${closingMedia\[0\]\.public_url \|\| closingMedia\[0\]\.url}`;/{
  /\/\/ Build WhatsApp message/c\
      // Generate shortened URLs\
      let contractShortUrl = null;\
      let receiptShortUrl = null;\
      let openingVideoShortUrl = null;\
      let closingVideoShortUrl = null;\
\
      if (options.contract && rental.signature_url) {\
        const contractUrl = await generateContractPDF();\
        contractShortUrl = await shortenUrl(contractUrl);\
      }\
\
      if (options.receipt && rental.payment_status === 'paid') {\
        const receiptUrl = await generateReceiptPDF();\
        receiptShortUrl = await shortenUrl(receiptUrl);\
      }\
\
      if (options.openingVideo && openingMedia.length > 0) {\
        const openingUrl = openingMedia[0]?.public_url || openingMedia[0]?.url;\
        if (openingUrl) openingVideoShortUrl = await shortenUrl(openingUrl);\
      }\
\
      if (options.closingVideo && closingMedia.length > 0) {\
        const closingUrl = closingMedia[0]?.public_url || closingMedia[0]?.url;\
        if (closingUrl) closingVideoShortUrl = await shortenUrl(closingUrl);\
      }\
\
      // Build concise WhatsApp message\
      const formatRentalId = (rental) => {\
        return rental.id ? \`#\${rental.id.toString().padStart(4, '0')}\` : 'N/A';\
      };\
\
      let message = \`Hi \${rental.customer_name}! 👋\\n\\n\`;\
      message += \`📋 Rental \${formatRentalId(rental)} Documents\\n\\n\`;\
\
      if (contractShortUrl) message += \`📄 Contract: \${contractShortUrl}\\n\`;\
      if (receiptShortUrl) message += \`💰 Receipt: \${receiptShortUrl}\\n\`;\
\
      if (openingVideoShortUrl) message += \`\\n📹 Opening Video: \${openingVideoShortUrl}\\n\`;\
      if (closingVideoShortUrl) message += \`📹 Closing Video: \${closingVideoShortUrl}\\n\`;\
\
      message += \`\\nThank you! 🏍️\`;
  /const formatRentalId/d
  /let message = /d
  /message += itemsToSend/d
  /message += `\\n\\nRental ID/d
  /\/\/ Add video URLs if selected/d
  /if (options\.openingVideo/d
  /message += `\\n\\nOpening Video/d
  /}/d
  /if (options\.closingVideo/d
  /message += `\\n\\nClosing Video/d
}
