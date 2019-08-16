import {join} from "path";
import {BaseCase, describeMultiSpec} from "@chainsafe/eth2.0-spec-test-util";
import bls from "../../src";
import {BLSPubkey} from "@chainsafe/eth2.0-types";

export interface AggregateSignaturesCase extends BaseCase {
    input: string[];
    output: string
}

describeMultiSpec<AggregateSignaturesCase, string>(
    join(__dirname, "./spec-tests/tests/bls/aggregate_sigs/aggregate_sigs.yaml"),
    bls.aggregateSignatures,
    ({input}) => {
        const pubKeys: BLSPubkey[] = [];
        input.forEach((pubKey: string) => {
            pubKeys.push(Buffer.from(pubKey.replace('0x', ''), 'hex'))
        });
        return [
            pubKeys
        ];
    },
    ({output}) => output,
    (result) => `0x${result.toString('hex')}`,
    () => false,
);
