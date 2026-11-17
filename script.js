const CONTRACT_ADDRESS = "0x542c62C8E364ba7735a69a47488E617FDAa7E4b9";

const CONTRACT_ABI = [
    "function deposit() payable",
    "function withdraw(uint256 amount)",
    "function checkBlance() view returns (uint256 balance)",
    "event Deposit(address indexed owner, uint256 amount)",
    "event Withdraw(address indexed owner, uint256 amount)"
];

const INFURA_URL =
    "https://sepolia.infura.io/v3/f62c6f06d3544b67ad90cded25c922e0";

const SEPOLIA_CHAIN_ID = 11155111n;

// Set a timeout so failed connection checks do not wait indefinitely.
const infuraRequest = new ethers.FetchRequest(INFURA_URL);
infuraRequest.timeout = 15000;

// Disable batching to keep each connection check straightforward.
const infuraProvider = new ethers.JsonRpcProvider(
    infuraRequest,
    undefined,
    { batchMaxCount: 1 }
);

// Read-only contract: requests go through Infura.
const readContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    infuraProvider
);

// Transaction contract: requests go through MetaMask.
let provider;
let signer;
let contract;

let busy = false;
let checkingInfura = false;

// Elements
const connectButton = document.getElementById("connectButton");
const checkBalanceButton = document.getElementById("checkBalanceButton");
const walletAddress = document.getElementById("walletAddress");
const balanceDisplay = document.getElementById("balance");
const statusMessage = document.getElementById("statusMessage");

const infuraStatus = document.getElementById("infuraStatus");
const infuraDetails = document.getElementById("infuraDetails");
const retryInfuraButton = document.getElementById("retryInfuraButton");

const depositForm = document.getElementById("depositForm");
const withdrawForm = document.getElementById("withdrawForm");

function showStatus(message, type = "secondary") {
    statusMessage.textContent = message;
    statusMessage.className = `alert alert-${type} mb-0`;
}

function setBusy(value) {
    busy = value;

    connectButton.disabled = value;
    checkBalanceButton.disabled = value;

    depositForm.querySelector("button").disabled = value;
    withdrawForm.querySelector("button").disabled = value;
}

function getErrorMessage(error) {
    if (
        error.code === 4001 ||
        error.code === "ACTION_REJECTED" ||
        error.info?.error?.code === 4001
    ) {
        return "Request rejected in MetaMask.";
    }

    return error.reason ||
        error.shortMessage ||
        error.message ||
        "Something went wrong.";
}

function markInfuraConnected(details) {
    infuraStatus.textContent = "Connected · Sepolia";
    infuraStatus.className = "badge text-bg-success";

    infuraDetails.textContent =
        `${details} Last successful check: ` +
        new Date().toLocaleTimeString();
}

function markInfuraFailed(error) {
    infuraStatus.textContent = "Connection failed";
    infuraStatus.className = "badge text-bg-danger";

    infuraDetails.textContent = getErrorMessage(error);
}

// Check Infura independently of MetaMask.
async function checkInfuraConnection() {
    if (checkingInfura) return;

    checkingInfura = true;
    retryInfuraButton.disabled = true;

    infuraStatus.textContent = "Checking...";
    infuraStatus.className = "badge text-bg-secondary";
    infuraDetails.textContent = "Checking the blockchain endpoint...";

    try {
        const chainId = await infuraProvider.send("eth_chainId", []);

        if (BigInt(chainId) !== SEPOLIA_CHAIN_ID) {
            throw new Error(
                "The Infura endpoint is not connected to Ethereum Sepolia."
            );
        }

        const blockHex = await infuraProvider.send(
            "eth_blockNumber",
            []
        );

        const blockNumber = BigInt(blockHex).toLocaleString();

        markInfuraConnected(`Latest block: ${blockNumber}.`);
    } catch (error) {
        markInfuraFailed(error);
    } finally {
        checkingInfura = false;
        retryInfuraButton.disabled = false;
    }
}

async function requireConnectedWallet() {
    if (!signer || !contract) {
        throw new Error("Please connect MetaMask first.");
    }

    const chainId = await window.ethereum.request({
        method: "eth_chainId"
    });

    if (BigInt(chainId) !== SEPOLIA_CHAIN_ID) {
        throw new Error(
            "Please switch MetaMask to the Sepolia network."
        );
    }
}

function getAmount(inputId) {
    const input = document.getElementById(inputId).value.trim();

    if (!/^\d+(\.\d{1,18})?$/.test(input)) {
        throw new Error(
            "Enter a valid ETH amount with up to 18 decimal places."
        );
    }

    const amountWei = ethers.parseEther(input);

    if (amountWei <= 0n) {
        throw new Error("Amount must be greater than zero.");
    }

    return amountWei;
}

// Read through Infura, supplying the connected account as msg.sender.
async function loadBankBalance() {
    const address = await signer.getAddress();

    let balanceWei;

    try {
        balanceWei = await readContract.checkBlance({
            from: address
        });
    } catch (error) {
        // Probe the endpoint separately: a contract error does not
        // necessarily mean that the Infura connection failed.
        void checkInfuraConnection();
        throw error;
    }

    balanceDisplay.textContent =
        `${ethers.formatEther(balanceWei)} ETH`;

    markInfuraConnected("Bank balance read successfully.");

    return balanceWei;
}

// 1. Connect MetaMask
async function connectWallet() {
    if (busy) return;

    setBusy(true);

    try {
        if (!window.ethereum) {
            throw new Error(
                "MetaMask not found. Please install the MetaMask extension."
            );
        }

        showStatus("Connecting to MetaMask...", "info");

        provider = new ethers.BrowserProvider(window.ethereum);

        await provider.send("eth_requestAccounts", []);

        const chainId = await window.ethereum.request({
            method: "eth_chainId"
        });

        if (BigInt(chainId) !== SEPOLIA_CHAIN_ID) {
            throw new Error(
                "Please switch MetaMask to Sepolia, then connect again."
            );
        }

        signer = await provider.getSigner();

        contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            CONTRACT_ABI,
            signer
        );

        const address = await signer.getAddress();

        walletAddress.textContent = address;

        connectButton.textContent =
            `${address.slice(0, 6)}...${address.slice(-4)}`;

        connectButton.classList.remove("btn-primary");
        connectButton.classList.add("btn-success");

        showStatus(
            "MetaMask connected. Loading balance through Infura...",
            "info"
        );

        try {
            await loadBankBalance();

            showStatus(
                "MetaMask connected. Balance loaded through Infura.",
                "success"
            );
        } catch (error) {
            showStatus(
                "Wallet connected, but bank balance loading failed: " +
                getErrorMessage(error),
                "warning"
            );
        }
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    } finally {
        setBusy(false);
    }
}

// 2. Check Balance through Infura
async function checkBalance() {
    if (busy) return;

    setBusy(true);

    try {
        await requireConnectedWallet();

        showStatus("Loading balance through Infura...", "info");

        await loadBankBalance();

        showStatus(
            "Balance loaded through Infura.",
            "success"
        );
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    } finally {
        setBusy(false);
    }
}

async function showConfirmedTransaction(action, form) {
    form.reset();

    try {
        await loadBankBalance();

        showStatus(`${action} successful!`, "success");
    } catch (error) {
        showStatus(
            `${action} confirmed, but balance refresh failed. ` +
            "Click Check Balance to retry.",
            "warning"
        );
    }
}

// 3. Deposit through MetaMask
async function deposit(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);

    try {
        await requireConnectedWallet();

        const amountWei = getAmount("depositAmount");

        showStatus(
            "Confirm the deposit in MetaMask...",
            "info"
        );

        const tx = await contract.deposit({
            value: amountWei
        });

        showStatus(
            "Deposit submitted. Waiting for confirmation...",
            "info"
        );

        await tx.wait();

        await showConfirmedTransaction(
            "Deposit",
            depositForm
        );
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    } finally {
        setBusy(false);
    }
}

// 4. Withdraw through MetaMask
async function withdraw(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);

    try {
        await requireConnectedWallet();

        const amountWei = getAmount("withdrawAmount");

        showStatus(
            "Confirm the withdrawal in MetaMask...",
            "info"
        );

        const tx = await contract.withdraw(amountWei);

        showStatus(
            "Withdrawal submitted. Waiting for confirmation...",
            "info"
        );

        await tx.wait();

        await showConfirmedTransaction(
            "Withdrawal",
            withdrawForm
        );
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    } finally {
        setBusy(false);
    }
}

// Button and form events
connectButton.addEventListener("click", connectWallet);

checkBalanceButton.addEventListener(
    "click",
    checkBalance
);

retryInfuraButton.addEventListener(
    "click",
    checkInfuraConnection
);

depositForm.addEventListener("submit", deposit);
withdrawForm.addEventListener("submit", withdraw);

// Refresh when the wallet account or network changes.
if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
        window.location.reload();
    });

    window.ethereum.on("chainChanged", () => {
        window.location.reload();
    });
}

// Check Infura on page load and every 30 seconds.
checkInfuraConnection();

setInterval(checkInfuraConnection, 30000);