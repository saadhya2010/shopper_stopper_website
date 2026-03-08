const API_KEY = "AIzaSyDNWWnmoZqcIKYqSyryNMpnlRiizJqF6k8";
const pageLoadTime = Date.now();
let popupIsOpen = false;
let isBypassing = false;

//webscraping to get price of selected item and cart total
function parseCurrency(text) {
    if (!text) return 0;
    const clean = text.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
}

function getItemPrice() {
    //found selectors from amazon and target websites that direct to price tags
    const selectors = [
        '#corePrice_desktop .a-offscreen', 
        '.a-price .a-offscreen',
        '[data-test="product-price"]',
        '[data-test="@web/Price/PriceFull"]',
        '.priceBlockBuyingPriceString',
        '.a-color-price'
    ];
    
    for (let selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim()) return el.innerText;
    }
    return "Price Not Found";
}

function getCartSubtotal() {
    const selectors = [
        '#nav-cart-count + .nav-line-2',
        '#sw-subtotal .a-price-whole',
        '.styles__CartLinkSubtotal-sc-16786t-1'
    ];
    for (let selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim()) return el.innerText;
    }
    return "Price Not Found";
}

//gemini API call
async function getAIAnalysis(itemName, price) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    const minutesSpent = Math.floor((Date.now() - pageLoadTime) / 60000);
    const timeString = minutesSpent === 0 ? "less than a minute" : `${minutesSpent} minutes`;
    const body = {
        contents: [{
            parts: [{
                text: `You are an honest financial coach. The user is looking at "${itemName}" for $${price}. 
                Give a [Impulse Score: X/10] and a witty, savage 2-sentence roast about why this is a waste of money with actual psychological, expert-level insights about this impulse purchase.
                Consider the time of day: "${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}".
                Also consider the time spent on the site: "${timeString}".`
            }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        // Extract the text from the Gemini JSON structure
        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("API Error:", e);
        return "[Impulse Score: 7/10] > You’re currently experiencing 'Decision Fatigue' from your morning meetings, and you're trying to buy a 'new identity' to reward yourself for simply surviving until noon.";
    }
}

//pop-up formatting
async function showPopup(itemName, itemPriceText, cartSubtotalText, originalButton) {
    if (popupIsOpen) return;
    popupIsOpen = true;

    const itemPrice = parseCurrency(itemPriceText);
    const oldCart = parseCurrency(cartSubtotalText);
    const newTotal = (itemPrice + oldCart).toFixed(2);

    const overlay = document.createElement("div");
    overlay.id = "ss-overlay";
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.9)', zIndex: '2147483647', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif'
    });

    overlay.innerHTML = `<div style="background: white; padding: 40px; border-radius: 20px; text-align: center;">
        <h2 style="color: #e0628a;">Consulting the Financial Gods...</h2>
    </div>`;
    document.body.appendChild(overlay);

    const aiText = await getAIAnalysis(itemName, itemPrice);

    overlay.innerHTML = `
        <div style="background: white; padding: 35px; border-radius: 25px; text-align: center; width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="margin: 0; color: #e0628a;">Financial Intervention</h2>
            <div style="margin: 20px 0; padding: 15px; background: #fdf2f7; border-radius: 15px; border: 1px solid #fdaac5; font-size: 1.1em; line-height: 1.4; color: #333;">
                ${aiText}
            </div>
            <div style="text-align: left; margin-bottom: 20px; color: #555; border-top: 1px solid #eee; pt: 10px;">
                <p><strong>Item Price:</strong> $${itemPrice.toFixed(2)}</p>
                <p><strong>Total if you buy:</strong> $${newTotal}</p>
            </div>
            <div id="ss-timer" style="font-weight: bold; margin-bottom: 20px; color: #e0628a;">Cooling down: 5s</div>
            <button id="ss-yes" disabled style="width: 100%; padding: 12px; background: #ccc; color: white; border: none; border-radius: 20px; cursor: not-allowed; font-weight: bold;">I still want it</button>
            <button id="ss-no" style="width: 100%; padding: 12px; background: none; border: 2px solid #fdaac5; color: #e0628a; border-radius: 20px; margin-top: 10px; cursor: pointer; font-weight: bold;">Save my money</button>
        </div>`;

    let count = 5;
    const timer = setInterval(() => {
        count--;
        const timerEl = document.getElementById('ss-timer');
        const yesBtn = document.getElementById('ss-yes');
        if (count <= 0) {
            clearInterval(timer);
            timerEl.innerText = "If you're sure...";
            yesBtn.disabled = false;
            yesBtn.style.background = "#fdaac5";
            yesBtn.style.cursor = "pointer";
        } else {
            timerEl.innerText = `Cooling down: ${count}s`;
        }
    }, 1000);
    //buttons on the pop-up
    document.getElementById('ss-yes').onclick = () => { 
        isBypassing = true; 
        originalButton.click(); 
        overlay.remove(); 
        popupIsOpen = false; 
        setTimeout(() => isBypassing = false, 1000);
    };
    document.getElementById('ss-no').onclick = () => { 
        overlay.remove(); 
        popupIsOpen = false; 
    };
}

//putting it all together- listens for add to cart, triggers pop up if an impulse purchase, allows or cancels purchase based on user choice
document.addEventListener("click", function(event) {
    if (isBypassing) return;
    
    const btn = event.target.closest('button, input[type="submit"], [role="button"], #add-to-cart-button');
    if (!btn) return;

    const text = (btn.innerText || btn.value || "").toLowerCase();
    const isCartBtn = ["add to cart", "add to bag", "buy now"].some(w => text.includes(w)) || btn.id === "add-to-cart-button";

    if (isCartBtn) {
        event.preventDefault();
        event.stopPropagation();
        
        // Clean up title (removes "Amazon.com: ")
        const itemName = document.title.split(':')[0].trim();
        showPopup(itemName, getItemPrice(), getCartSubtotal(), btn);
    }
}, true);
