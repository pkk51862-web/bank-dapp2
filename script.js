const CONTRACT_ADDRESS = "0x542c62C8E364ba7735a69a47488E617FDAa7E4b9";

const CONTRACT_ABI = [
    "function deposit() payable",
    "function withdraw(uint256 amount)",
    "function checkBlance() view returns (uint256 balance)",
    "event Deposit(address indexed owner, uint256 amount)",
    "event Withdraw(address indexed owner, uint256 amount)"
];

// Infura connection for reading blockchain data
const INFURA_URL =
    "https://sepolia.infura.io/v3/f62c6f06d3544b67ad90cded25c922e0";

const SEPOLIA_CHAIN_ID = 11155111n;

const infuraProvider = new ethers.JsonRpcProvider(INFURA_URL);

const readContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    infuraProvider
);

// MetaMask connection for signing transactions
let provider;
let signer;
let contract;

const connectButton = document.getElementById("connectButton");
const checkBalanceButton = document.getElementById("checkBalanceButton");
const walletAddress = document.getElementById("walletAddress");
const balanceDisplay = document.getElementById("balance");
const statusMessage = document.getElementById("statusMessage");

const depositForm = document.getElementById("depositForm");
const withdrawForm = document.getElementById("withdrawForm");

let busy = false;

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

async function requireConnectedWallet() {
    if (!signer || !contract) {
        throw new Error("Please connect MetaMask first.");
    }

    // Query MetaMask directly to confirm the current network.
    const chainId = await window.ethereum.request({
        method: "eth_chainId"
    });

    if (BigInt(chainId) !== SEPOLIA_CHAIN_ID) {
        throw new Error("Please switch MetaMask to the Sepolia network.");
    }
}

function getAmount(inputId) {
    const input = document.getElementById(inputId).value.trim();

    // Accept ordinary decimal ETH amounts with up to 18 decimal places.
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

// Read the connected user's bank balance through Infura.
// Setting "from" supplies msg.sender for checkBlance().
async function loadBankBalance() {
    const address = await signer.getAddress();

    const balanceWei = await readContract.checkBlance({
        from: address
    });

    balanceDisplay.textContent =
        `${ethers.formatEther(balanceWei)} ETH`;

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
                "Please switch MetaMask to the Sepolia network, then connect again."
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

        // An Infura error should not imply the wallet failed to connect.
        try {
            await loadBankBalance();

            showStatus(
                "MetaMask connected. Balance loaded through Infura.",
                "success"
            );
        } catch (error) {
            showStatus(
                `Wallet connected, but Infura balance loading failed: ${
                    getErrorMessage(error)
                }`,
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

        showStatus("Balance loaded through Infura.", "success");
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    } finally {
        setBusy(false);
    }
}

// Refresh after confirmation without reporting a successful transaction
// as failed if Infura cannot load the updated balance.
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

        showStatus("Confirm the deposit in MetaMask...", "info");

        const tx = await contract.deposit({
            value: amountWei
        });

        showStatus(
            "Deposit submitted. Waiting for confirmation...",
            "info"
        );

        await tx.wait();

        await showConfirmedTransaction("Deposit", depositForm);
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

        showStatus("Confirm the withdrawal in MetaMask...", "info");

        const tx = await contract.withdraw(amountWei);

        showStatus(
            "Withdrawal submitted. Waiting for confirmation...",
            "info"
        );

        await tx.wait();

        await showConfirmedTransaction("Withdrawal", withdrawForm);
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    } finally {
        setBusy(false);
    }
}

// Events
connectButton.addEventListener("click", connectWallet);
checkBalanceButton.addEventListener("click", checkBalance);

depositForm.addEventListener("submit", deposit);
withdrawForm.addEventListener("submit", withdraw);

if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
        window.location.reload();
    });

    window.ethereum.on("chainChanged", () => {
        window.location.reload();
    });
}