import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import tongye_cdn_cert_deploy as cert


class Request:
    def from_json_string(self, value):
        self.payload = json.loads(value)


def domain(name, certificate="old", https="on"):
    return SimpleNamespace(Domain=name, Https=SimpleNamespace(
        Switch=https, CertInfo=SimpleNamespace(CertId=certificate)))


class CertificateDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.DescribeDomainsConfig.return_value.Domains = [domain(x) for x in cert.DOMAINS]
        self.client.ModifyDomainConfig.return_value.RequestId = "request-id"
        models = SimpleNamespace(DescribeDomainsConfigRequest=Request, ModifyDomainConfigRequest=Request)
        self.modules = patch.dict(sys.modules, {
            "tencentcloud": SimpleNamespace(), "tencentcloud.cdn": SimpleNamespace(),
            "tencentcloud.cdn.v20180606": SimpleNamespace(models=models),
        })
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def test_updates_only_certificate_id_of_exact_domains(self):
        cert.trigger_cdn_update(self.client, "old", "new")
        query = self.client.DescribeDomainsConfig.call_args.args[0].payload
        self.assertEqual(query["Filters"], [{"Name": "domain", "Value": list(cert.DOMAINS), "Fuzzy": False}])
        requests = [call.args[0] for call in self.client.ModifyDomainConfig.call_args_list]
        self.assertEqual([r.Domain for r in requests], list(cert.DOMAINS))
        for request in requests:
            self.assertEqual(vars(request), {"Domain": request.Domain, "Route": "Https.CertInfo.CertId", "Value": '{"update": "new"}'})

    def test_partial_update_is_resumable(self):
        self.client.DescribeDomainsConfig.return_value.Domains[0] = domain(cert.DOMAINS[0], "new")
        cert.trigger_cdn_update(self.client, "old", "new")
        self.client.ModifyDomainConfig.assert_called_once()
        self.assertEqual(self.client.ModifyDomainConfig.call_args.args[0].Domain, cert.DOMAINS[1])

    def test_already_bound_is_idempotent(self):
        self.client.DescribeDomainsConfig.return_value.Domains = [domain(x, "new") for x in cert.DOMAINS]
        self.assertEqual(cert.trigger_cdn_update(self.client, "old", "new"), "")
        self.client.ModifyDomainConfig.assert_not_called()

    def test_unexpected_binding_aborts_before_any_write(self):
        self.client.DescribeDomainsConfig.return_value.Domains[1] = domain(cert.DOMAINS[1], "unrelated")
        with self.assertRaises(cert.DeploymentError):
            cert.trigger_cdn_update(self.client, "old", "new")
        self.client.ModifyDomainConfig.assert_not_called()

    def test_disabled_https_aborts(self):
        self.client.DescribeDomainsConfig.return_value.Domains[1] = domain(cert.DOMAINS[1], https="off")
        with self.assertRaises(cert.DeploymentError):
            cert.trigger_cdn_update(self.client, "old", "new")
        self.client.ModifyDomainConfig.assert_not_called()

    def test_missing_or_extra_domain_aborts(self):
        for rows in [[domain(cert.DOMAINS[0])], [domain(cert.DOMAINS[0]), domain("unrelated.example")]]:
            self.client.DescribeDomainsConfig.return_value.Domains = rows
            with self.assertRaises(cert.DeploymentError):
                cert.trigger_cdn_update(self.client, "old", "new")
        self.client.ModifyDomainConfig.assert_not_called()

    def test_active_state_checks_live_tls_and_does_not_silently_pass(self):
        state = {"active_certificate_id": "new", "active_fingerprint_sha256": "fingerprint"}
        with patch.object(cert, "stage_current_certificate", return_value=(state, {"fingerprint_sha256": "fingerprint"}, "new")), patch.object(cert, "live_certificate_matches", return_value=(False, ["expired"])):
            with self.assertRaises(cert.DeploymentError):
                cert.renew_or_reconcile(state, {})


if __name__ == "__main__":
    unittest.main()
