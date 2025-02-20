/**
 * @module cli/commands
 */

import { CommanderStatic } from "commander";
import { JsonRpcProvider } from "ethers/providers";
import { Wallet } from "ethers/ethers";

import { config } from "@chainsafe/eth2.0-config/lib/presets/mainnet";
import { CliCommand } from "./interface";
import defaults from "../../eth1/options";
import * as ethers from "ethers/ethers";
import { ILogger, LogLevel, WinstonLogger, LogLevels } from "../../logger";
import { Eth1Wallet } from "../../eth1";
import { CliError } from "../error";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface IDepositCommandOptions {
  privateKey: string;
  logLevel: string;
  mnemonic: string;
  node: string;
  value: string;
  contract: string;
  accounts: number;
  delay: number;
}

export class DepositCommand implements CliCommand {

  public register(commander: CommanderStatic): void {

    commander
      .command("deposit")
      .description("Start private network with deposit contract and 10 accounts with balance")
      .option("-k, --privateKey [privateKey]", "Private key of account that will make deposit")
      .option(`-l, --logLevel [${LogLevels.join("|")}]`, "Log level")
      .option(
        "-m, --mnemonic [mnemonic]",
        "If mnemonic is submitted, first 10 accounts will make deposit"
      )
      .option("-n, --node [node]", "Url of eth1 node", "http://127.0.0.1:8545")
      .option("-v, --value [value]", "Amount of ether to deposit", "32")
      .option(
        "-c, --contract [contract]",
        "Address of deposit contract",
        defaults.depositContract.address
      )
      .option("-a, --accounts [accounts]", "Number of accounts to generate at startup", 10)
      .option("-t, --delay [delay]", "Delay between sending deposits (in seconds)", 5)
      .action(async (options) => {
        const logger: ILogger = new WinstonLogger({
          level: options.logLevel,
          module: "deposit",
        });
        //library is not awaiting this method so don't allow error propagation
        // (unhandled promise rejections)
        try {
          await this.action(options, logger);
        } catch (e) {
          logger.error(e.message + "\n" + e.stack);
        }
      });
  }

  public async action(options: IDepositCommandOptions, logger: ILogger): Promise<void> {
    const provider = new JsonRpcProvider(options.node);
    try {
      //check if we can connect to node
      await provider.getBlockNumber();
    } catch (e) {
      throw new CliError(`JSON RPC node (${options.node}) not available. Reason: ${e.message}`);
    }

    const wallets = [];
    if (options.mnemonic) {
      wallets.push(...this.fromMnemonic(options.mnemonic, provider, options.accounts));
    } else if (options.privateKey) {
      wallets.push(new ethers.Wallet(options.privateKey, provider));
    } else {
      throw new CliError("You have to submit either privateKey or mnemonic. Check --help");
    }

    for (let i = 0; i < wallets.length; i++) {
      let wallet = wallets[i];
      try {
        // @ts-ignore
        const hash =
          await (new Eth1Wallet(wallet.privateKey, defaults.depositContract.abi, config, logger, provider))
            .createValidatorDeposit(options.contract, ethers.utils.parseEther(options.value));
        logger.info(
          `Successfully deposited ${options.value} ETH from ${wallet.address} 
          to deposit contract. Tx hash: ${hash}`
        );
        await sleep(options.delay * 1000);

      } catch (e) {
        throw new CliError(
          `Failed to make deposit for account ${wallet.address}. Reason: ${e.message}`
        );
      }
    }
  }

  /**
   *
   * @param mnemonic
   * @param provider
   * @param n number of wallets to retrieve
   */
  private fromMnemonic(mnemonic: string, provider: JsonRpcProvider, n: number): ethers.Wallet[] {
    const wallets = [];
    for (let i = 0; i < n; i++) {
      let wallet = ethers.Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${i}`);
      wallet = wallet.connect(provider);
      wallets.push(wallet);
    }
    return wallets;
  }
}
