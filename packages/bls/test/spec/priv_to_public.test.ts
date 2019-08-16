import {join} from "path";
import {BaseCase, describeMultiSpec} from "@chainsafe/eth2.0-spec-test-util";
import bls from "../../src";

export interface PrivateToPublicCase extends BaseCase {
    input: string;
    output: string
}

describeMultiSpec<PrivateToPublicCase, string>(
    join(__dirname, "./spec-tests/tests/bls/priv_to_pub/priv_to_pub.yaml"),
    bls.generatePublicKey,
    ({input}) => {
        return [Buffer.from(input.replace('0x', ''), 'hex')];
    },
    ({output}) => output,
    (result) => `0x${result.toString('hex')}`,
    () => false,
);
