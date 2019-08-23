/**
 * @module opPool
 */

import {EventEmitter} from "events";

import {BeaconBlock, BeaconBlockHeader, BeaconState, Epoch, ProposerSlashing, Slot, ValidatorIndex} from "@chainsafe/eth2.0-types";
import {IBeaconConfig} from "@chainsafe/eth2.0-config";

import {getBeaconProposerIndex} from "../chain/stateTransition/util";
import {BeaconDb} from "../db";
import {IOpPoolOptions} from "./options";
import {
  AttestationOperations,
  AttesterSlashingOperations,
  DepositsOperations,
  ProposerSlashingOperations,
  TransferOperations,
  VoluntaryExitOperations
} from "./modules";
import {IEth1Notifier} from "../eth1";
import {computeEpochOfSlot} from "../chain/stateTransition/util";
import {blockToHeader} from "../chain/stateTransition/util/blockRoot";

/**
 * Pool of operations not yet included on chain
 */
export class OpPool extends EventEmitter {

  public attestations: AttestationOperations;
  public voluntaryExits: VoluntaryExitOperations;
  public deposits: DepositsOperations;
  public transfers: TransferOperations;
  public proposerSlashings: ProposerSlashingOperations;
  public attesterSlashings: AttesterSlashingOperations;

  private readonly config: IBeaconConfig;
  private readonly eth1: IEth1Notifier;
  private readonly db: BeaconDb;
  private proposers: Map<Epoch, Map<ValidatorIndex, Slot>>;

  public constructor(opts: IOpPoolOptions, {config, eth1, db}) {
    super();
    this.config = config;
    this.eth1 = eth1;
    this.db = db;
    this.proposers = new Map();
    this.attestations = new AttestationOperations(this.db.attestation);
    this.voluntaryExits = new VoluntaryExitOperations(this.db.voluntaryExit);
    this.deposits = new DepositsOperations(this.db.deposit);
    this.transfers = new TransferOperations(this.db.transfer);
    this.proposerSlashings = new ProposerSlashingOperations(this.db.proposerSlashing);
    this.attesterSlashings = new AttesterSlashingOperations(this.db.attesterSlashing);
  }

  /**
   * Start operation processing
   */
  public async start(): Promise<void> {
    this.eth1.on('deposit', this.deposits.receive.bind(this.deposits));
  }

  /**
   * Stop operation processing
   */
  public async stop(): Promise<void> {
    this.removeListener('deposit', this.deposits.receive.bind(this.deposits));
  }

  /**
   * Remove stored operations based on a newly processed block
   */
  public async processBlockOperations(processedBlock: BeaconBlock): Promise<void> {
    const tasks = [
      this.voluntaryExits.remove(processedBlock.body.voluntaryExits),
      this.deposits.removeOld(processedBlock.body.eth1Data.depositCount),
      this.transfers.remove(processedBlock.body.transfers),
      this.proposerSlashings.remove(processedBlock.body.proposerSlashings),
      this.attesterSlashings.remove(processedBlock.body.attesterSlashings),
      this.checkDuplicateProposer(processedBlock)
      //TODO: remove old attestations
    ];
    await Promise.all(tasks);
  }

  public async checkDuplicateProposer(block: BeaconBlock): Promise<void> {
    const epoch: Epoch = computeEpochOfSlot(this.config, block.slot);
    const existingProposers: Map<ValidatorIndex, Slot> = this.proposers.get(epoch);
    const state: BeaconState = await this.db.state.getLatest();

    const proposerIndex: ValidatorIndex = await getBeaconProposerIndex(this.config, state);

    // Check if proposer already exists
    if (existingProposers && existingProposers.has(proposerIndex)) {
      const existingSlot: Slot = this.proposers.get(epoch).get(proposerIndex);
      const prevBlock: BeaconBlock = await this.db.block.getBlockBySlot(existingSlot);

      // Create slashing
      const slashing: ProposerSlashing = {
        proposerIndex: proposerIndex,
        header1: blockToHeader(this.config, prevBlock),
        header2: blockToHeader(this.config, block)
      };
      await this.proposerSlashings.receive(slashing);
    } else {
      const proposers: Map<ValidatorIndex, Slot> = new Map();
      proposers.set(proposerIndex, block.slot);
      this.proposers.set(epoch, proposers);
    }
    // TODO Prune map every so often
  }
}
