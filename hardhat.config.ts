import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
    solidity: "0.7.6",
    networks: {
        hardhat: {
            forking: {
                url: process.env.HTTP_URL!,
            }
        }
    },
    typechain: {
      outDir: "../types/typechain",
      target: "ethers-v6",
    },
};

module.exports = config;