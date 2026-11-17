const CONTRACT_ADDRESS = "0x542c62C8E364ba7735a69a47488E617FDAa7E4b9";

const CONTRACT_ABI = [
    "function deposit() payable",
    "function withdraw(uint256 amount)",
    "function checkBlance() view returns (uint256 balance)",
    "event Deposit(address indexed owner, uint256 amount)",
    "event Withdraw(address indexed owner, uint256 amount)"
];

let provider;
let signer;
let contract;

const connectButton = document.getElementById("connectButton");
const checkBalanceButton = document.getElementById("checkBalanceButton");
const walletAddress = document.getElementById("walletAddress");
const balanceDisplay = document.getElementById("balance");
const statusMessage = document.getElementById("statusMessage");

function showStatus(message, type = "secondary") {
    statusMessage.textContent = message;
    statusMessage.className = `alert alert-${type} mb-0`;
}

function getErrorMessage(error) {
    if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        return "Request rejected in MetaMask.";
    }

    return error.shortMessage ||
        error.reason ||
        error.message ||
        "Something went wrong.";
}

// Connect MetaMask
async function connectWallet() {
    try {
        if (!window.ethereum) {
            throw new Error(
                "MetaMask not found. Please install the MetaMask extension."
            );
        }

        showStatus("Connecting to MetaMask...", "info");

        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);

        const network = await provider.getNetwork();

        if (network.chainId !== 11155111n) {
            throw new Error("Please switch MetaMask to the Sepolia network.");
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

        await checkBalance();
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    }
}

// Read the connected account's balance in the bank contract
async function checkBalance() {
    try {
        if (!contract) {
            throw new Error("Please connect MetaMask first.");
        }

        const balanceWei = await contract.checkBlance();

        balanceDisplay.textContent =
            `${ethers.formatEther(balanceWei)} ETH`;

        showStatus("Balance loaded successfully.", "success");
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    }
}

function getAmount(inputId) {
    const input = document.getElementById(inputId).value.trim();

    if (!input || !Number.isFinite(Number(input)) || Number(input) <= 0) {
        throw new Error("Enter a valid ETH amount greater than zero.");
    }

    const amountWei = ethers.parseEther(input);

    if (amountWei <= 0n) {
        throw new Error("Amount must be greater than zero.");
    }

    return amountWei;
}

// Deposit ETH
async function deposit(event) {
    event.preventDefault();

    try {
        if (!contract) {
            throw new Error("Please connect MetaMask first.");
        }

        const amountWei = getAmount("depositAmount");

        showStatus("Confirm the deposit in MetaMask...", "info");

        const tx = await contract.deposit({ value: amountWei });

        showStatus(
            "Deposit submitted. Waiting for confirmation...",
            "info"
        );

        await tx.wait();

        document.getElementById("depositForm").reset();
        await checkBalance();

        showStatus("Deposit successful!", "success");
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    }
}

// Withdraw ETH
async function withdraw(event) {
    event.preventDefault();

    try {
        if (!contract) {
            throw new Error("Please connect MetaMask first.");
        }

        const amountWei = getAmount("withdrawAmount");

        showStatus("Confirm the withdrawal in MetaMask...", "info");

        const tx = await contract.withdraw(amountWei);

        showStatus(
            "Withdrawal submitted. Waiting for confirmation...",
            "info"
        );

        await tx.wait();

        document.getElementById("withdrawForm").reset();
        await checkBalance();

        showStatus("Withdrawal successful!", "success");
    } catch (error) {
        showStatus(getErrorMessage(error), "danger");
    }
}

connectButton.addEventListener("click", connectWallet);
checkBalanceButton.addEventListener("click", checkBalance);

document.getElementById("depositForm")
    .addEventListener("submit", deposit);

document.getElementById("withdrawForm")
    .addEventListener("submit", withdraw);

if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
        window.location.reload();
    });

    window.ethereum.on("chainChanged", () => {
        window.location.reload();
    });
}