package server

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net"
	"os"
	"slices"
	"time"

	"github.com/go-acme/lego/v4/certcrypto"
	"github.com/go-acme/lego/v4/certificate"
	"github.com/go-acme/lego/v4/challenge/dns01"
	"github.com/go-acme/lego/v4/lego"
	legoroute53 "github.com/go-acme/lego/v4/providers/dns/route53"
	"github.com/go-acme/lego/v4/registration"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

type LegoCertConfig struct {
	AccountPrivateKey     crypto.PrivateKey
	CertificatePrivateKey crypto.PrivateKey
	Email                 string
	ACMEUrl               string
	Route53HostedZoneID   string
	Domains               []string
	Registration          *registration.Resource
}

func (lcc *LegoCertConfig) GetEmail() string {
	return lcc.Email
}
func (lcc *LegoCertConfig) GetRegistration() *registration.Resource {
	return lcc.Registration
}
func (lcc *LegoCertConfig) GetPrivateKey() crypto.PrivateKey {
	return lcc.AccountPrivateKey
}

func GetOrGeneratePrivateKey(ctx context.Context, filename string) (crypto.PrivateKey, error) {
	logger := telemetry.LoggerFromContext(ctx).With(
		slog.String("filename", filename),
	)

	var key crypto.PrivateKey

	logger.InfoContext(ctx, "attempting to read private key file")
	keyFile, err := os.Open(filename)

	if err != nil && errors.Is(err, os.ErrNotExist) {
		logger.WarnContext(ctx, "private key file does not exist, generating new private key")

		key, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return key, fmt.Errorf("error generating private key: %w", err)
		}
		data, err := x509.MarshalPKCS8PrivateKey(key)
		if err != nil {
			return key, fmt.Errorf("error generating private key: %w", err)
		}
		keyFile, err = os.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
		if err != nil {
			return key, fmt.Errorf("error writing key file: %w", err)
		}
		err = pem.Encode(keyFile, &pem.Block{
			Type:  "PRIVATE KEY",
			Bytes: data,
		})
		if err != nil {
			return key, fmt.Errorf("error writing key file: %w", err)
		}
		err = keyFile.Close()
		if err != nil {
			return key, fmt.Errorf("error closing key file: %w", err)
		}

		logger.InfoContext(ctx, "new private key written to file")
		return key, nil
	}

	if err != nil {
		return key, fmt.Errorf("error opening key file: %w", err)
	}

	logger.InfoContext(ctx, "reading and parsing existing private key")
	b, err := io.ReadAll(keyFile)
	if err != nil {
		return key, fmt.Errorf("error reading key file: %w", err)
	}
	err = keyFile.Close()
	if err != nil {
		return key, fmt.Errorf("error closing key file: %w", err)
	}
	block, _ := pem.Decode(b)
	key, err = x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return key, fmt.Errorf("error reading key file: %w", err)
	}

	logger.InfoContext(ctx, "finished reading and parsing existing private key")
	return key, nil
}

func GetOrGenerateACMECert(ctx context.Context, filename string, config *LegoCertConfig) error {
	logger := telemetry.LoggerFromContext(ctx).With(
		slog.String("acme_email", config.Email),
		slog.String("acme_url", config.ACMEUrl),
		slog.Any("domains", config.Domains),
		slog.String("route53_hosted_zone_id", config.Route53HostedZoneID),
		slog.String("filename", filename),
	)

	logger.InfoContext(ctx, "attempting to read certificate file")
	certFile, err := os.Open(filename)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("error opening cert file: %w", err)
	}

	if err == nil {
		logger.InfoContext(ctx, "reading and parsing existing certificate")
		data, err := io.ReadAll(certFile)
		if err != nil {
			return fmt.Errorf("error reading cert file: %w", err)
		}

		err = certFile.Close()
		if err != nil {
			return fmt.Errorf("error closing cert file: %w", err)
		}

		block, _ := pem.Decode(data)
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return fmt.Errorf("error parsing cert file: %w", err)
		}

		needsRegenerate := false
		certTimeLeft := cert.NotAfter.Sub(time.Now())
		certLogger := logger.With(
			slog.Time("cert_not_after", cert.NotAfter),
			slog.Duration("cert_time_left", certTimeLeft),
			slog.String("cert_cn", cert.Subject.CommonName),
			slog.Any("cert_sans", cert.DNSNames),
		)
		if certTimeLeft < (40 * 24 * time.Hour) {
			certLogger.WarnContext(ctx, "certificate will expire in under 40 days, will regenerate")
			needsRegenerate = true
		}

		existingDomains := append(cert.DNSNames, cert.Subject.CommonName)
		for _, existingDomain := range existingDomains {
			if !slices.Contains(config.Domains, existingDomain) {
				certLogger.WarnContext(
					ctx,
					"certificate's CN and SANs do not match current server configuration, will regnerate",
					slog.String("remove_domain", existingDomain),
				)
				needsRegenerate = true
				break
			}
		}
		for _, newDomain := range config.Domains {
			if !slices.Contains(existingDomains, newDomain) {
				certLogger.WarnContext(
					ctx,
					"certificate's CN and SANs do not match current server configuration, will regnerate",
					slog.String("new_domain", newDomain),
				)
				needsRegenerate = true
				break
			}
		}

		if !needsRegenerate {
			certLogger.InfoContext(ctx, "certificate is valid and does not need to be regenerated")
			return nil
		}
	}

	logger.InfoContext(ctx, "generating new certificate")
	dns01.SetIPv4Only()
	legoConfig := lego.NewConfig(config)

	legoConfig.CADirURL = config.ACMEUrl
	legoConfig.Certificate.KeyType = certcrypto.EC256

	legoClient, err := lego.NewClient(legoConfig)
	if err != nil {
		return fmt.Errorf("error initializing Lego client: %w", err)
	}

	legoDNSProvider, err := legoroute53.NewDNSProviderConfig(&legoroute53.Config{
		HostedZoneID:             config.Route53HostedZoneID,
		MaxRetries:               5,
		WaitForRecordSetsChanged: true,
		TTL:                      10,
		PropagationTimeout:       2 * time.Minute,
		PollingInterval:          4 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("error initializing Lego Route53 provider: %w", err)
	}

	err = legoClient.Challenge.SetDNS01Provider(legoDNSProvider)
	if err != nil {
		return fmt.Errorf("error setting Lego DNS provider: %w", err)
	}

	config.Registration, err = legoClient.Registration.Register(registration.RegisterOptions{
		TermsOfServiceAgreed: true,
	})
	if err != nil {
		return fmt.Errorf("error setting up Lego registration: %w", err)
	}

	request := certificate.ObtainRequest{
		Domains:    config.Domains,
		PrivateKey: config.CertificatePrivateKey,
		Bundle:     true,
	}

	cert, err := legoClient.Certificate.Obtain(request)
	if err != nil {
		return fmt.Errorf("error obtaining certificate: %w", err)
	}

	logger.InfoContext(ctx, "writing certificate to file")
	certFile, err = os.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("error writing certificate file: %w", err)
	}

	_, err = certFile.Write(cert.Certificate)
	if err != nil {
		return fmt.Errorf("error writing certificate file: %w", err)
	}

	logger.InfoContext(ctx, "finished generating certificate and writing to file")
	return nil
}

func GetOrGenerateSelfSignedCert(ctx context.Context, filename string, config *LegoCertConfig) error {
	logger := telemetry.LoggerFromContext(ctx).With(
		slog.Any("domains", config.Domains),
		slog.String("filename", filename),
	)

	logger.InfoContext(ctx, "attempting to read certificate file")
	certFile, err := os.Open(filename)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("error opening cert file: %w", err)
	}

	if err == nil {
		logger.InfoContext(ctx, "reading and parsing existing certificate")
		data, err := io.ReadAll(certFile)
		if err != nil {
			return fmt.Errorf("error reading cert file: %w", err)
		}

		err = certFile.Close()
		if err != nil {
			return fmt.Errorf("error closing cert file: %w", err)
		}

		block, _ := pem.Decode(data)
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return fmt.Errorf("error parsing cert file: %w", err)
		}

		needsRegenerate := false
		certTimeLeft := cert.NotAfter.Sub(time.Now())
		certLogger := logger.With(
			slog.Time("cert_not_after", cert.NotAfter),
			slog.Duration("cert_time_left", certTimeLeft),
			slog.String("cert_cn", cert.Subject.CommonName),
			slog.Any("cert_sans", cert.DNSNames),
		)
		if certTimeLeft < (40 * 24 * time.Hour) {
			certLogger.WarnContext(ctx, "certificate will expire in under 40 days, will regenerate")
			needsRegenerate = true
		}

		existingDomains := append(cert.DNSNames, cert.Subject.CommonName)
		for _, existingDomain := range existingDomains {
			if !slices.Contains(config.Domains, existingDomain) {
				certLogger.WarnContext(
					ctx,
					"certificate's CN and SANs do not match current server configuration, will regnerate",
					slog.String("remove_domain", existingDomain),
				)
				needsRegenerate = true
				break
			}
		}
		for _, newDomain := range config.Domains {
			if !slices.Contains(existingDomains, newDomain) {
				certLogger.WarnContext(
					ctx,
					"certificate's CN and SANs do not match current server configuration, will regnerate",
					slog.String("new_domain", newDomain),
				)
				needsRegenerate = true
				break
			}
		}

		if !needsRegenerate {
			certLogger.InfoContext(ctx, "certificate is valid and does not need to be regenerated")
			return nil
		}
	}

	logger.InfoContext(ctx, "generating new certificate")

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"Shimiko Self-Signed Certificate"},
			CommonName:   config.Domains[0], // First domain is the CN
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(3650 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	for _, domain := range config.Domains {
		if ip := net.ParseIP(domain); ip != nil {
			template.IPAddresses = append(template.IPAddresses, ip)
		} else {
			template.DNSNames = append(template.DNSNames, domain)
		}
	}

	derBytes, err := x509.CreateCertificate(
		rand.Reader,
		&template,
		&template,
		&(config.CertificatePrivateKey).(*ecdsa.PrivateKey).PublicKey,
		config.CertificatePrivateKey,
	)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %w", err)
	}

	logger.InfoContext(ctx, "writing certificate to file")
	certFile, err = os.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("error writing certificate file: %w", err)
	}

	err = pem.Encode(certFile, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	if err != nil {
		return fmt.Errorf("failed to write certificate: %w", err)
	}
	err = certFile.Close()
	if err != nil {
		return fmt.Errorf("failed to close certificate file: %w", err)
	}

	return nil
}
