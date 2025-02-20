/**
 * @module chain/stateTransition/epoch/util
 */

import assert from "assert";
import {deserialize, equals, hashTreeRoot} from "@chainsafe/ssz";

import {BeaconState, Crosslink, Epoch, Gwei, PendingAttestation, Shard, uint256, ValidatorIndex,} from "@chainsafe/eth2.0-types";
import {IBeaconConfig} from "@chainsafe/eth2.0-config";

import {GENESIS_EPOCH, GENESIS_START_SHARD, ZERO_HASH} from "../../../constants";
import {
  getActiveValidatorIndices,
  getAttestationDataSlot,
  getAttestingIndices,
  getBlockRoot,
  getBlockRootAtSlot,
  getCurrentEpoch,
  getPreviousEpoch,
  getTotalBalance
} from "../util";


export function getMatchingSourceAttestations(
  config: IBeaconConfig,
  state: BeaconState,
  epoch: Epoch
): PendingAttestation[] {
  const currentEpoch = getCurrentEpoch(config, state);
  assert(epoch === currentEpoch || epoch === getPreviousEpoch(config, state));
  return epoch === currentEpoch
    ? state.currentEpochAttestations
    : state.previousEpochAttestations;
}

export function getMatchingTargetAttestations(
  config: IBeaconConfig,
  state: BeaconState,
  epoch: Epoch
): PendingAttestation[] {
  const blockRoot = getBlockRoot(config, state, epoch);
  return getMatchingSourceAttestations(config, state, epoch)
    .filter((a) => a.data.target.root.equals(blockRoot));
}

export function getMatchingHeadAttestations(
  config: IBeaconConfig,
  state: BeaconState,
  epoch: Epoch
): PendingAttestation[] {
  return getMatchingSourceAttestations(config, state, epoch)
    .filter((a) => a.data.beaconBlockRoot
      .equals(getBlockRootAtSlot(config, state, getAttestationDataSlot(config, state, a.data))));
}

export function getUnslashedAttestingIndices(
  config: IBeaconConfig,
  state: BeaconState,
  attestations: PendingAttestation[]
): ValidatorIndex[] {
  const output: Set<ValidatorIndex> = new Set();
  attestations.forEach((a) =>
    getAttestingIndices(config, state, a.data, a.aggregationBits).forEach((index) =>
      output.add(index)));
  return Array.from(output).filter((index) => !state.validators[index].slashed).sort();
}

export function getAttestingBalance(
  config: IBeaconConfig,
  state: BeaconState,
  attestations: PendingAttestation[]
): Gwei {
  return getTotalBalance(state, getUnslashedAttestingIndices(config, state, attestations));
}

export function getWinningCrosslinkAndAttestingIndices(
  config: IBeaconConfig,
  state: BeaconState,
  epoch: Epoch,
  shard: Shard
): [Crosslink, ValidatorIndex[]] {

  const attestations = getMatchingSourceAttestations(config, state, epoch)
    .filter((a) => a.data.crosslink.shard === shard);
  const currentCrosslinkRoot = hashTreeRoot(state.currentCrosslinks[shard], config.types.Crosslink);
  const currentCrosslink = state.currentCrosslinks[shard];
  const crosslinks = attestations.filter((a) => (
    currentCrosslinkRoot.equals(a.data.crosslink.parentRoot) ||
    equals(currentCrosslink, a.data.crosslink, config.types.Crosslink))
  ).map((a) => a.data.crosslink);

  const defaultCrossLink: Crosslink = {
    shard: GENESIS_START_SHARD,
    startEpoch: GENESIS_EPOCH,
    endEpoch: GENESIS_EPOCH,
    parentRoot: ZERO_HASH,
    dataRoot: ZERO_HASH,
  };

  if (crosslinks.length === 0) {
    return [defaultCrossLink, []];
  }

  // Winning crosslink has the crosslink data root with the most balance voting
  // for it (ties broken lexicographically)
  const winningCrosslink = crosslinks
    .map((crosslink) => ({
      crosslink,
      balance: getAttestingBalance(
        config,
        state,
        attestations.filter((a) => equals(a.data.crosslink, crosslink, config.types.Crosslink)),
      ),
    }))
    .reduce((a, b) => {
      if (b.balance.gt(a.balance)) {
        return b;
      } else if (b.balance.eq(a.balance)) {
        if ((deserialize(b.crosslink.dataRoot, config.types.uint256) as uint256)
          .gt(deserialize(a.crosslink.dataRoot, config.types.uint256) as uint256)) {
          return b;
        }
      }
      return a;
    }).crosslink;
  const winningAttestations = attestations.filter((a) =>
    equals(a.data.crosslink, winningCrosslink, config.types.Crosslink));
  return [winningCrosslink, getUnslashedAttestingIndices(config, state, winningAttestations)];
}
