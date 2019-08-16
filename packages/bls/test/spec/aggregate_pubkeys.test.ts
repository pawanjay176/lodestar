import {join} from "path";
import {BaseCase, describeMultiSpec} from "@chainsafe/eth2.0-spec-test-util";
import bls from "../../src";
import {BLSSignature} from "@chainsafe/eth2.0-types";
import {describe} from "mocha";

export interface AggregatePubkeysCase extends BaseCase {
    input: string[];
    output: string
}


describeMultiSpec<AggregatePubkeysCase, string>(
    join(__dirname, "./spec-tests/tests/bls/aggregate_pubkeys/aggregate_pubkeys.yaml"),
    bls.aggregatePubkeys,
    ({input}) => {
        const sigs: BLSSignature[] = [];
        input.forEach((sig: string) => {
            sigs.push(Buffer.from(sig.replace('0x', ''), 'hex'))
        });
        return [
            sigs
        ];
    },
    ({output}) => output,
    (result) => `0x${result.toString('hex')}`,
    () => false,
);
